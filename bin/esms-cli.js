#!/usr/bin/env node

const {
  sendMessage,
  receiveMessage,
  getMessageDelivery,
} = require("../src/index");

function printHelp() {
  console.log(`
Usage:
  esms-cli send --alias <alias> --to <recipients> --message <text> [--type transactional|promotional] [--multilang] [--transport auto|soap|http] [--username <u>] [--password <p>] [--id <id>] [--customer <c>] [--debug]
  esms-cli receive --shortcode <shortCode> [--username <u>] [--password <p>] [--id <id>] [--customer <c>]
  esms-cli receive --longnumber <longNumber> [--username <u>] [--password <p>] [--id <id>] [--customer <c>]
  esms-cli delivery --alias <alias> [--username <u>] [--password <p>] [--id <id>] [--customer <c>]

Examples:
  ESMS_USERNAME=user ESMS_PASSWORD=pass esms-cli send --alias QATest --to 071XXXXXX,077XXXXXX --message "Hello" --type promotional
  ESMS_USERNAME=user ESMS_PASSWORD=pass esms-cli receive --shortcode 77000
  ESMS_USERNAME=user ESMS_PASSWORD=pass esms-cli delivery --alias QATest

Required environment variables:
  ESMS_USERNAME
  ESMS_PASSWORD

Optional environment variables:
  ESMS_ID
  ESMS_CUSTOMER
  ESMS_WSDL_URL

Note:
  Local numbers like 071XXXXXXX are auto-converted to 9471XXXXXXX.
`);
}

function parseArgs(argv) {
  const args = {};
  let command = null;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];

    if (!command && !token.startsWith("--")) {
      command = token;
      continue;
    }

    if (token.startsWith("--")) {
      const key = token.slice(2).toLowerCase();
      const value = argv[i + 1];

      if (!value || value.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = value;
        i += 1;
      }
    }
  }

  return { command, args };
}

function printResult(result) {
  console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
}

function extractCredentialArgs(args) {
  return {
    username: args.username,
    password: args.password,
    id: args.id,
    customer: args.customer,
  };
}

async function runSend(args) {
  if (!args.alias || !args.to || !args.message) {
    throw new Error("--alias, --to and --message are required");
  }

  const result = await sendMessage({
    alias: args.alias,
    recipients: args.to,
    message: args.message,
    messageType: args.type || "transactional",
    multiLang: Boolean(args.multilang),
    transport: args.transport || "auto",
    debug: Boolean(args.debug),
    ...extractCredentialArgs(args),
  });

  printResult(result);
}

async function runReceive(args) {
  const shortCode = args.shortcode;
  const longNumber = args.longnumber;

  if (!shortCode && !longNumber) {
    throw new Error("Use either --shortcode or --longnumber");
  }

  const result = await receiveMessage({
    shortCode,
    longNumber,
    ...extractCredentialArgs(args),
  });
  printResult(result);
}

async function runDelivery(args) {
  if (!args.alias) {
    throw new Error("--alias is required");
  }

  const result = await getMessageDelivery({
    alias: args.alias,
    ...extractCredentialArgs(args),
  });
  printResult(result);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    return;
  }

  const { command, args } = parseArgs(argv);

  if (command === "send") {
    await runSend(args);
    return;
  }

  if (command === "receive") {
    await runReceive(args);
    return;
  }

  if (command === "delivery") {
    await runDelivery(args);
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
