const {
  sendMessage,
  receiveMessage,
  getMessageDelivery,
} = require("../src/index");

async function main() {
  const sendResult = await sendMessage({
    username: process.env.ESMS_USERNAME || "XXXX",
    password: process.env.ESMS_PASSWORD || "YYYY",
    alias: "QATest",
    message: "Test",
    recipients: "071XXXXXX,077XXXXXX,076XXXXXX",
    messageType: "transactional",
  });
  console.log("Send response:", sendResult);

  const incoming = await receiveMessage({
    username: process.env.ESMS_USERNAME || "XXXX",
    password: process.env.ESMS_PASSWORD || "YYYY",
    shortCode: "77000",
  });
  console.log("Receive response:", incoming);

  const delivery = await getMessageDelivery({
    username: process.env.ESMS_USERNAME || "XXXX",
    password: process.env.ESMS_PASSWORD || "YYYY",
    alias: "QATest",
  });
  console.log("Delivery response:", delivery);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exitCode = 1;
});
