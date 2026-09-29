declare module "ebics-client" {
  export interface KeysObject {
    A006: string | null;
    E002: string | null;
    X002: string | null;
    bankX002: string | null;
    bankE002: string | null;
  }

  export interface KeyStorage {
    write(data: string): Promise<void>;
    read(): Promise<string>;
  }

  export interface EbicsOrder {
    version: string;
    orderDetails: Record<string, unknown>;
    operation: string;
    transactionId?: string;
  }

  export interface EbicsSendResult {
    orderData: Buffer | string | Record<string, never>;
    orderId: string;
    technicalCode: string;
    technicalCodeSymbol: string;
    technicalCodeShortText: string;
    technicalCodeMeaning: string;
    businessCode: string;
    businessCodeSymbol: string;
    businessCodeShortText: string;
    businessCodeMeaning: string;
    bankKeys?: {
      bankX002?: { toPem?: () => string } | string;
      bankE002?: { toPem?: () => string } | string;
      [key: string]: unknown;
    };
  }

  export class Client {
    constructor(options: {
      url: string;
      partnerId: string;
      userId: string;
      hostId: string;
      passphrase: string | Buffer;
      iv?: string | Buffer;
      keyStorage: KeyStorage;
      tracesStorage?: unknown;
      bankName?: string;
      bankShortName?: string;
      languageCode?: string;
      storageLocation?: string | null;
    });
    url: string;
    partnerId: string;
    userId: string;
    hostId: string;
    bankName: string;
    languageCode: string;
    send(order: EbicsOrder): Promise<EbicsSendResult>;
    keys(): Promise<{
      a: () => unknown;
      x: () => unknown;
      e: () => unknown;
      setBankKeys: (keys: unknown) => void;
    } | null>;
    setBankKeys(bankKeys: unknown): Promise<void>;
  }

  export class BankLetter {
    constructor(options: {
      client: Client;
      bankName: string;
      template: string;
    });
    generate(): Promise<string>;
  }

  export const Orders: {
    INI: EbicsOrder;
    HIA: EbicsOrder;
    HPB: EbicsOrder;
    C53: (start?: string | null, end?: string | null) => EbicsOrder;
    STA: (start?: string | null, end?: string | null) => EbicsOrder;
    [key: string]: unknown;
  };

  export function fsKeysStorage(pathToFile: string): KeyStorage;
}
