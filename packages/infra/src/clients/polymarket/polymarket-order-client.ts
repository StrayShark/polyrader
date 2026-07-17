import { ClobClient, OrderType, Side, type TickSize } from '@polymarket/clob-client';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { polygon } from 'viem/chains';

const HOST = process.env.POLYMARKET_CLOB_API_URL ?? 'https://clob.polymarket.com';
const CHAIN_ID = 137;

export interface PlaceLimitOrderInput {
  tokenId: string;
  price: number;
  size: number;
  side: 'buy' | 'sell';
  tickSize?: TickSize;
  negRisk?: boolean;
}

export interface PlaceLimitOrderResult {
  orderId?: string;
  status?: string;
  raw: unknown;
}

/**
 * Wraps @polymarket/clob-client for signed limit orders.
 * Requires POLYMARKET_PRIVATE_KEY + L2 API credentials + POLYMARKET_FUNDER/POLYMARKET_ADDRESS.
 */
export class PolymarketOrderClient {
  private client: ClobClient | null = null;
  private initError?: string;

  canPlaceOrders(): boolean {
    if (process.env.POLYMARKET_LIVE_TRADING_ENABLED === 'false') return false;
    return this.getInitError() === undefined;
  }

  getInitError(): string | undefined {
    if (this.initError) return this.initError;
    const privateKey = process.env.POLYMARKET_PRIVATE_KEY?.trim();
    const funder = envValue(process.env.POLYMARKET_FUNDER) ?? envValue(process.env.POLYMARKET_ADDRESS);
    const apiKey = process.env.POLYMARKET_API_KEY ?? process.env.POLY_API_KEY;
    const apiSecret = process.env.POLYMARKET_API_SECRET ?? process.env.POLY_API_SECRET;
    const apiPassphrase = process.env.POLYMARKET_API_PASSPHRASE ?? process.env.POLY_API_PASSPHRASE;

    if (!privateKey) return 'POLYMARKET_PRIVATE_KEY is not configured';
    if (!funder) return 'POLYMARKET_FUNDER or POLYMARKET_ADDRESS is not configured';
    if (!apiKey || !apiSecret || !apiPassphrase) {
      return 'Polymarket L2 API credentials are not configured';
    }
    return undefined;
  }

  async createAndPostLimitOrder(input: PlaceLimitOrderInput): Promise<PlaceLimitOrderResult> {
    const client = await this.getClient();
    const side = input.side === 'sell' ? Side.SELL : Side.BUY;
    const response = await client.createAndPostOrder(
      {
        tokenID: input.tokenId,
        price: input.price,
        side,
        size: input.size,
      },
      {
        tickSize: input.tickSize ?? '0.01',
        negRisk: input.negRisk ?? false,
      },
      OrderType.GTC,
    );

    const row = response as Record<string, unknown>;
    return {
      orderId: optionalString(row.orderID ?? row.orderId ?? row.id),
      status: optionalString(row.status),
      raw: response,
    };
  }

  private async getClient(): Promise<ClobClient> {
    if (this.client) return this.client;

    const initError = this.getInitError();
    if (initError) {
      this.initError = initError;
      throw new Error(initError);
    }

    try {
      const privateKey = process.env.POLYMARKET_PRIVATE_KEY!.trim() as `0x${string}`;
      const funder = (envValue(process.env.POLYMARKET_FUNDER) ?? envValue(process.env.POLYMARKET_ADDRESS))!;
      const account = privateKeyToAccount(privateKey);
      const signer = createWalletClient({
        account,
        chain: polygon,
        transport: http(),
      });
      const creds = {
        key: (process.env.POLYMARKET_API_KEY ?? process.env.POLY_API_KEY)!,
        secret: (process.env.POLYMARKET_API_SECRET ?? process.env.POLY_API_SECRET)!,
        passphrase: (process.env.POLYMARKET_API_PASSPHRASE ?? process.env.POLY_API_PASSPHRASE)!,
      };
      const signatureType = Number(process.env.POLYMARKET_SIGNATURE_TYPE ?? '1') as 0 | 1 | 2;

      this.client = new ClobClient(
        HOST,
        CHAIN_ID,
        signer,
        creds,
        signatureType,
        funder,
      );
      return this.client;
    } catch (err) {
      this.initError = (err as Error).message;
      throw err;
    }
  }
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value);
  return text ? text : undefined;
}

function envValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
