import { gql } from "graphql-request";
import { X42Client } from "../core/client";

export class IndexerModule {
  private client: X42Client;

  constructor(client: X42Client) {
    this.client = client;
  }

  /**
   * Fetch a list of markets
   */
  async getMarkets(first = 10, skip = 0) {
    const query = gql`
      query GetMarkets($first: Int!, $skip: Int!) {
        marketCreateds(first: $first, skip: $skip, orderBy: blockTimestamp, orderDirection: desc) {
          id
          market
          creator
          title
          blockTimestamp
        }
      }
    `;
    return this.client.gql.request(query, { first, skip });
  }

  /**
   * Fetch historical trades for a specific user
   */
  async getTradesByUser(userAddress: string) {
    const query = gql`
      query GetTrades($user: String!) {
        tradedV2S(where: { user: $user }, orderBy: blockTimestamp, orderDirection: desc) {
          id
          market
          outcomeIndex
          amountOt
          costCollateral
          isBuy
          blockTimestamp
        }
      }
    `;
    return this.client.gql.request(query, { user: userAddress.toLowerCase() });
  }

  /**
   * Fetch historical trades for a specific market to render charts
   */
  async getTradesByMarket(marketAddress: string, first = 1000) {
    const query = gql`
      query GetMarketTrades($market: String!, $first: Int!) {
        trades(
          where: { market: $market }, 
          first: $first, 
          orderBy: timestamp, 
          orderDirection: asc
        ) {
          id
          tokenId
          otAmount
          collateralAmount
          isMint
          timestamp
          user {
            id
          }
        }
      }
    `;
    return this.client.gql.request(query, { market: marketAddress.toLowerCase(), first });
  }

  /**
   * Fetch details for a specific market including question metadata
   */
  async getMarketDetails(marketAddress: string) {
    const query = gql`
      query GetMarketDetails($market: ID!) {
        market(id: $market) {
          id
          collateral
          curve
          question {
            id
            title
            creator
            outcomeNames
            isResolved
            isFinalised
          }
        }
      }
    `;
    return this.client.gql.request(query, { market: marketAddress.toLowerCase() });
  }
}
