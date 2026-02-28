# mobitel-esms

Node.js library for Mobitel (Sri Lanka) Enterprise SMS.

## Install

```bash
npm install mobitel-esms
```

## What this library exposes

- `sendMessage(options)`
- `receiveMessage(options)`
- `getMessageDelivery(options)`

Sessions are managed internally.

## Message type mapping

- `"transactional"` -> `0`
- `"promotional"` -> `1`

You can also pass `0` or `1` directly.

## Transport options

`sendMessage` supports:

- `transport: "auto"` (default) -> try SOAP, fallback to HTTP
- `transport: "soap"` -> SOAP only
- `transport: "http"` -> HTTP only

## Credentials

You can pass credentials in function options:

- `username` (required)
- `password` (required)
- `id` (optional, default `""`)
- `customer` (optional, default `""`)
- `wsdlUrl` (optional)

Or use environment variables:

```bash
export ESMS_USERNAME="your_username"
export ESMS_PASSWORD="your_password"

# Optional
export ESMS_ID=""
export ESMS_CUSTOMER=""
export ESMS_WSDL_URL="https://msmsenterpriseapi.mobitel.lk/mSMSEnterpriseAPI/mSMSEnterpriseAPI.wsdl"
```

## Quick usage (CommonJS)

```js
const { sendMessage } = require("mobitel-esms");

async function main() {
  const result = await sendMessage({
    username: "YOUR_USERNAME",
    password: "YOUR_PASSWORD",
    alias: "alias",
    recipients: "07xxxxxxxx",
    message: "test",
    messageType: "transactional"
  });

  console.log(result);
  // {
  //   transport: "soap" | "http",
  //   code: 200,
  //   success: true,
  //   response: ...
  // }
}

main().catch(console.error);
```

## Quick usage (ESM)

```js
import { sendMessage } from "mobitel-esms";
```

## API details

### `sendMessage(options)`

Required:

- `alias`
- `recipients` (`"071..."` or `"94..."` string, comma-separated string, or array)
- `message`

Optional:

- `messageType` (`"transactional"` default, `"promotional"`, `0`, `1`)
- `multiLang` (`boolean`)
- `transport` (`"auto"` default, `"soap"`, `"http"`)
- `debug` (`boolean`, useful with HTTP transport)
- credential fields (`username`, `password`, `id`, `customer`, `wsdlUrl`)

Note: local numbers like `071XXXXXXXX` are normalized to `9471XXXXXXX`.

### `receiveMessage(options)`

Required:

- one of `shortCode` or `longNumber`

Optional:

- credential fields (`username`, `password`, `id`, `customer`, `wsdlUrl`)

### `getMessageDelivery(options)`

Required:

- `alias`

Optional:

- credential fields (`username`, `password`, `id`, `customer`, `wsdlUrl`)

## CLI

After install, use `esms-cli`:

```bash
esms-cli send --alias Alias --to 07xxxxxxxx --message "test" --type transactional
```

Explicit credentials:

```bash
esms-cli send \
  --alias Alias \
  --to 07xxxxxxxx \
  --message "test" \
  --type transactional \
  --transport http \
  --username "YOUR_USERNAME" \
  --password "YOUR_PASSWORD"
```

Receive and delivery:

```bash
esms-cli receive --shortcode 77000 --username "YOUR_USERNAME" --password "YOUR_PASSWORD"
esms-cli delivery --alias Alias --username "YOUR_USERNAME" --password "YOUR_PASSWORD"
```

With `npx`:

```bash
npx mobitel-esms send --alias Alias --to 07xxxxxxxx --message "test"
```
