/**
 * read_filings tool — reads text from securities reports (有価証券報告書) via EDINET DB API.
 */

import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import type { EdinetClient } from './edinet-client.js';
import type { CompanyResolver } from './resolver.js';

export const READ_FILINGS_DESCRIPTION = `
有価証券報告書のテキストを読み取ります。事業概要、リスク、MD&A等。

## When to Use
- 企業の事業内容・ビジネスモデルを理解したいとき
- リスク要因を確認したいとき
- 経営陣のMD&A（経営者による分析）を読みたいとき
- 中長期戦略を確認したいとき

## When NOT to Use
- 数値的な財務データが必要なとき（→ get_financials）
- 最新ニュースが必要なとき（→ web_search）
`;

interface TextBlocksResponse {
  text_blocks?: Array<{
    section?: string;
    text?: string;
  }>;
}

/**
 * Create the read_filings tool.
 */
export function createReadFilings(
  edinetClient: EdinetClient,
  resolver: CompanyResolver,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'read_filings',
    description:
      '有価証券報告書のテキストを読み取ります。事業概要、リスク、MD&A等。',
    schema: z.object({
      query: z
        .string()
        .describe(
          '銘柄コード（例: "7203"）または企業名（例: "トヨタ自動車"）',
        ),
      section: z
        .enum([
          'business_overview',
          'risk_factors',
          'mda',
          'strategy',
          'all',
        ])
        .optional()
        .describe(
          '読み取るセクション。省略時はall。',
        ),
    }),
    func: async ({ query, section }) => {
      try {
        const company = await resolver.resolve(query);

        const params: Record<string, string> = {
          edinet_code: company.edinetCode,
        };
        if (section && section !== 'all') {
          params.section = section;
        }

        const data = await edinetClient.get<TextBlocksResponse>(
          'text-blocks',
          params,
        );

        const blocks = data.text_blocks ?? [];
        if (blocks.length === 0) {
          return JSON.stringify({
            error: `${company.name}（${company.code}）の有価証券報告書テキストが見つかりませんでした。`,
          });
        }

        const text = blocks
          .map((b) => {
            const header = b.section ? `【${b.section}】\n` : '';
            return `${header}${b.text ?? ''}`;
          })
          .join('\n\n---\n\n');

        return JSON.stringify({
          company: {
            code: company.code,
            name: company.name,
            edinetCode: company.edinetCode,
          },
          section: section ?? 'all',
          text,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        return JSON.stringify({ error: message });
      }
    },
  });
}
