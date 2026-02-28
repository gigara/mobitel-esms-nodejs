const soap = require("soap");
const https = require("https");

const DEFAULT_WSDL_URL =
  "https://msmsenterpriseapi.mobitel.lk/mSMSEnterpriseAPI/mSMSEnterpriseAPI.wsdl";
const DEFAULT_HTTP_SEND_URL =
  "https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxy.php";
const DEFAULT_HTTP_SEND_MULTILANG_URL =
  "https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxy_multilang.php";
const DEFAULT_HTTP_SEND_JSON_URL =
  "https://msmsenterpriseapi.mobitel.lk/EnterpriseSMSV3/esmsproxyURL.php";

const MESSAGE_TYPES = Object.freeze({
  TRANSACTIONAL: 0,
  PROMOTIONAL: 1,
});

const TRANSPORTS = Object.freeze({
  AUTO: "auto",
  SOAP: "soap",
  HTTP: "http",
});

function clean(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  const text = String(value).trim();
  if (text === "" || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return fallback;
  }

  return text;
}

function toNumericCode(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number(trimmed);
    }

    // Handle JSON-like response: {"resultcode":"151", ...}
    const jsonCode = trimmed.match(/"resultcode"\s*:\s*"(\d{3})"/i);
    if (jsonCode) {
      return Number(jsonCode[1]);
    }

    const bareCode = trimmed.match(/\b(\d{3})\b/);
    if (bareCode) {
      return Number(bareCode[1]);
    }
  }

  if (value && typeof value === "object") {
    for (const key of ["code", "status", "responseCode", "returnCode", "resultcode"]) {
      const parsed = toNumericCode(value[key]);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  return null;
}

function buildSendResult({ transport, rawResponse, code, attempts }) {
  const resolvedCode = code !== null && code !== undefined ? code : toNumericCode(rawResponse);

  const result = {
    transport,
    code: resolvedCode,
    success: resolvedCode === 200,
    response: rawResponse,
  };

  if (attempts && attempts.length > 0) {
    result.attempts = attempts;
  }

  return result;
}

function normalizeRecipients(recipients) {
  const normalizeNumber = (raw) => {
    const compact = String(raw).replace(/\s+/g, "").trim();
    if (/^0\d{9}$/.test(compact)) {
      return `94${compact.slice(1)}`;
    }
    return compact;
  };

  if (Array.isArray(recipients)) {
    return recipients.map(normalizeNumber).filter(Boolean);
  }

  if (typeof recipients === "string") {
    return recipients
      .split(",")
      .map(normalizeNumber)
      .filter(Boolean);
  }

  throw new TypeError("recipients must be an array or comma-separated string");
}

function resolveMessageType(messageType = "transactional") {
  if (messageType === 0 || messageType === 1) {
    return messageType;
  }

  if (typeof messageType !== "string") {
    throw new TypeError("messageType must be 'transactional' or 'promotional'");
  }

  const normalized = messageType.trim().toLowerCase();

  if (normalized === "transactional" || normalized === "normal") {
    return MESSAGE_TYPES.TRANSACTIONAL;
  }
  if (normalized === "promotional") {
    return MESSAGE_TYPES.PROMOTIONAL;
  }

  throw new Error("Invalid messageType. Use 'transactional' or 'promotional'");
}

function resolveTransport(options = {}, env = process.env) {
  const transport = clean(options.transport || env.ESMS_TRANSPORT, TRANSPORTS.AUTO).toLowerCase();

  if (!Object.values(TRANSPORTS).includes(transport)) {
    throw new Error("Invalid transport. Use 'auto', 'soap', or 'http'");
  }

  return transport;
}

function resolveCredentials(options = {}, env = process.env) {
  return {
    wsdlUrl: clean(options.wsdlUrl || env.ESMS_WSDL_URL, DEFAULT_WSDL_URL),
    id: clean(options.id || env.ESMS_ID, ""),
    username: clean(options.username || env.ESMS_USERNAME, ""),
    password: clean(options.password || env.ESMS_PASSWORD, ""),
    customer: clean(options.customer || env.ESMS_CUSTOMER, ""),
  };
}

function decodeXmlText(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function unwrapSoapReturn(parsed) {
  if (Array.isArray(parsed)) {
    return parsed.length === 1 ? unwrapSoapReturn(parsed[0]) : parsed;
  }

  if (!parsed || typeof parsed !== "object") {
    return parsed;
  }

  if (Object.prototype.hasOwnProperty.call(parsed, "return")) {
    return parsed.return;
  }

  const key = Object.keys(parsed).find((k) => k.toLowerCase().endsWith("return"));
  if (key) {
    return parsed[key];
  }

  if (Object.keys(parsed).length === 1) {
    return unwrapSoapReturn(parsed[Object.keys(parsed)[0]]);
  }

  return parsed;
}

function parseReturnFromRawXml(rawXml) {
  if (typeof rawXml !== "string" || rawXml.trim() === "") {
    return null;
  }

  const nilMatch = rawXml.match(
    /<[\w:]*[\w-]*return\b[^>]*xsi:nil\s*=\s*["']true["'][^>]*\/?>/i
  );
  if (nilMatch) {
    return null;
  }

  const returnMatch = rawXml.match(
    /<([\w:]*[\w-]*return)\b[^>]*>([\s\S]*?)<\/\1>/i
  );
  if (!returnMatch) {
    return null;
  }

  const content = returnMatch[2].trim();
  if (content === "") {
    return null;
  }

  // Try to map common session fields from raw XML.
  const fields = {};
  for (const key of ["id", "sessionId", "expiryDate", "isActive", "user"]) {
    const match = content.match(
      new RegExp(`<[\\w:]*${key}\\b[^>]*>([\\s\\S]*?)<\\/[\\w:]*${key}>`, "i")
    );
    if (match) {
      fields[key] = decodeXmlText(match[1].trim());
    }
  }

  if (Object.keys(fields).length > 0) {
    return fields;
  }

  return decodeXmlText(content);
}

async function getSoapClient(wsdlUrl) {
  return soap.createClientAsync(wsdlUrl, { disableCache: true });
}

async function callSoap(client, methodName, payload) {
  const method = client[`${methodName}Async`];
  if (typeof method !== "function") {
    throw new Error(`SOAP method not found: ${methodName}`);
  }

  const [parsedResponse, rawResponse] = await method.call(client, payload);
  const value = unwrapSoapReturn(parsedResponse);
  if (value !== null && typeof value !== "undefined") {
    return value;
  }

  return parseReturnFromRawXml(rawResponse);
}

async function callSoapAny(client, methodNames, payload) {
  let lastError = null;

  for (const methodName of methodNames) {
    const method = client[`${methodName}Async`];
    if (typeof method !== "function") {
      continue;
    }

    try {
      return await callSoap(client, methodName, payload);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(`SOAP method not found: ${methodNames.join(", ")}`);
}

async function createSession(client, credentials) {
  const user = {
    id: credentials.id,
    username: credentials.username,
    password: credentials.password,
    customer: credentials.customer,
  };

  const payloadVariants = [{ user }, { arg0: user }, user];

  for (const payload of payloadVariants) {
    const session = await callSoap(client, "createSession", payload);
    if (session && session !== "") {
      return session;
    }
  }

  throw new Error("Session creation failed: API returned empty session.");
}

async function closeSessionSafe(client, session) {
  try {
    await callSoap(client, "closeSession", { session });
  } catch (error) {
    // Best effort close; do not hide original send/receive errors.
  }
}

async function withSession(credentials, action) {
  if (!credentials.username || !credentials.password) {
    throw new Error(
      "username and password are required (pass in options or set ESMS_USERNAME and ESMS_PASSWORD)"
    );
  }

  const client = await getSoapClient(credentials.wsdlUrl);
  const session = await createSession(client, credentials);

  try {
    return await action({ client, session });
  } finally {
    await closeSessionSafe(client, session);
  }
}

function httpRequest({ method = "GET", url, headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let data = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({ statusCode: res.statusCode || 0, body: data.trim() });
      });
    });

    req.setTimeout(20000, () => {
      req.destroy(new Error("HTTP request timed out"));
    });

    if (body) {
      req.write(body);
    }

    req.end();
    req.on("error", reject);
  });
}

async function sendMessageViaHttp(credentials, options) {
  const recipients = normalizeRecipients(options.recipients).join(",");
  const endpoint = options.multiLang
    ? DEFAULT_HTTP_SEND_MULTILANG_URL
    : DEFAULT_HTTP_SEND_URL;

  const buildUrl = (base, params) => {
    const url = new URL(base);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  };

  const attempts = [
    {
      name: "get-short",
      request: {
        method: "GET",
        url: buildUrl(endpoint, {
          m: options.message,
          r: recipients,
          a: options.alias,
          u: credentials.username,
          p: credentials.password,
          t: options.messageType,
        }),
      },
    },
    {
      name: "get-long",
      request: {
        method: "GET",
        url: buildUrl(endpoint, {
          message: options.message,
          to: recipients,
          from: options.alias,
          username: credentials.username,
          password: credentials.password,
          messageType: options.messageType,
        }),
      },
    },
  ];

  if (!options.multiLang) {
    const body = JSON.stringify({
      username: credentials.username,
      password: credentials.password,
      from: options.alias,
      to: recipients,
      text: options.message,
      mesageType: options.messageType,
      messageType: options.messageType,
    });

    attempts.push({
      name: "post-json",
      request: {
        method: "POST",
        url: DEFAULT_HTTP_SEND_JSON_URL,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
        body,
      },
    });
  }

  const debugAttempts = [];
  let lastCode = null;
  let lastBody = "";

  for (const attempt of attempts) {
    const response = await httpRequest(attempt.request);
    const code = toNumericCode(response.body);
    lastBody = response.body;

    debugAttempts.push({
      variant: attempt.name,
      statusCode: response.statusCode,
      code,
      body: response.body.slice(0, 180),
    });

    if (code === 200) {
      return buildSendResult({
        transport: TRANSPORTS.HTTP,
        rawResponse: response.body,
        code: 200,
        attempts: options.debug ? debugAttempts : undefined,
      });
    }

    if (code !== null) {
      lastCode = code;
    }
  }

  if (options.debug) {
    throw new Error(`HTTP send failed. attempts=${JSON.stringify(debugAttempts)}`);
  }

  return buildSendResult({
    transport: TRANSPORTS.HTTP,
    rawResponse: lastBody || String(lastCode || 151),
    code: lastCode || 151,
  });
}

async function sendMessage(options = {}) {
  const env = options.env || process.env;
  const credentials = resolveCredentials(options, env);
  const transport = resolveTransport(options, env);
  const messageType = resolveMessageType(options.messageType || "transactional");

  if (!options.alias) {
    throw new Error("alias is required");
  }
  if (!options.message) {
    throw new Error("message is required");
  }
  if (!options.recipients) {
    throw new Error("recipients are required");
  }
  if (!credentials.username || !credentials.password) {
    throw new Error(
      "username and password are required (pass in options or set ESMS_USERNAME and ESMS_PASSWORD)"
    );
  }

  if (transport === TRANSPORTS.HTTP) {
    return sendMessageViaHttp(credentials, {
      alias: options.alias,
      message: options.message,
      recipients: options.recipients,
      messageType,
      multiLang: Boolean(options.multiLang),
      debug: Boolean(options.debug),
    });
  }

  const sendWithSoap = () =>
    withSession(credentials, async ({ client, session }) => {
      const method = options.multiLang ? "sendMessagesMultiLang" : "sendMessages";
      const messageNode = options.multiLang ? "smsMessageMultiLang" : "smsMessage";

      return callSoap(client, method, {
        session,
        [messageNode]: {
          message: options.message,
          messageId: "",
          recipients: normalizeRecipients(options.recipients),
          retries: "",
          sender: options.alias,
          messageType,
          sequenceNum: "",
          status: "",
          time: "",
          type: "",
          user: "",
        },
      });
    });

  try {
    const response = await sendWithSoap();
    const code = toNumericCode(response);

    if (code === 151) {
      const retried = await sendWithSoap();
      return buildSendResult({
        transport: TRANSPORTS.SOAP,
        rawResponse: retried,
      });
    }

    return buildSendResult({
      transport: TRANSPORTS.SOAP,
      rawResponse: response,
    });
  } catch (error) {
    if (transport === TRANSPORTS.SOAP) {
      throw error;
    }

    return sendMessageViaHttp(credentials, {
      alias: options.alias,
      message: options.message,
      recipients: options.recipients,
      messageType,
      multiLang: Boolean(options.multiLang),
      debug: Boolean(options.debug),
    });
  }
}

async function receiveMessage(options = {}) {
  const credentials = resolveCredentials(options, options.env || process.env);
  const shortCode = clean(options.shortCode, "");
  const longNumber = clean(options.longNumber, "");

  if (!shortCode && !longNumber) {
    throw new Error("Either shortCode or longNumber is required");
  }
  if (shortCode && longNumber) {
    throw new Error("Provide either shortCode or longNumber, not both");
  }

  return withSession(credentials, async ({ client, session }) => {
    if (shortCode) {
      return callSoapAny(client, ["getMessagesFromShortcode", "getMessagesFromShortCode"], {
        session,
        shortcode: shortCode,
      });
    }

    return callSoap(client, "getMessagesFromLongNumber", {
      session,
      longNumber,
    });
  });
}

async function getMessageDelivery(options = {}) {
  const credentials = resolveCredentials(options, options.env || process.env);
  const alias = clean(options.alias, "");

  if (!alias) {
    throw new Error("alias is required");
  }

  return withSession(credentials, async ({ client, session }) =>
    callSoap(client, "getDeliveryReports", { session, alias })
  );
}

module.exports = {
  sendMessage,
  receiveMessage,
  getMessageDelivery,
};
