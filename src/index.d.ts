export type MessageType = "transactional" | "promotional" | 0 | 1;
export type Transport = "auto" | "soap" | "http";
export type Recipients = string[] | string;

export interface BaseOptions {
  wsdlUrl?: string;
  id?: string;
  username?: string;
  password?: string;
  customer?: string;
  transport?: Transport;
  env?: Record<string, string | undefined>;
}

export interface SendMessageOptions extends BaseOptions {
  alias: string;
  message: string;
  recipients: Recipients;
  messageType?: MessageType;
  multiLang?: boolean;
  debug?: boolean;
}

export interface SendMessageResult {
  transport: Transport;
  code: number | null;
  success: boolean;
  response: unknown;
  attempts?: Array<{
    variant: string;
    statusCode: number;
    code: number | null;
    body: string;
  }>;
}

export interface ReceiveMessageOptions extends BaseOptions {
  shortCode?: string;
  longNumber?: string;
}

export interface GetMessageDeliveryOptions extends BaseOptions {
  alias: string;
}

export function sendMessage(options: SendMessageOptions): Promise<SendMessageResult>;
export function receiveMessage(options: ReceiveMessageOptions): Promise<unknown>;
export function getMessageDelivery(
  options: GetMessageDeliveryOptions
): Promise<unknown>;

declare const defaultExport: {
  sendMessage: typeof sendMessage;
  receiveMessage: typeof receiveMessage;
  getMessageDelivery: typeof getMessageDelivery;
};

export default defaultExport;
