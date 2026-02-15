# CLAUDE.md — rapidapi-x402

## Overview

RapidAPI x402 プロキシサーバー。USDC決済（x402プロトコル）後にRapidAPI上のAPIへプロキシする独立サーバー。

## 技術スタック

| カテゴリ | 技術 |
|---------|------|
| ランタイム | Bun |
| 言語 | TypeScript |
| フレームワーク | Express 5 |
| x402決済 | `@x402/express` + `@x402/core` + `@x402/evm` |
| 外部API | RapidAPI (fetch) |

## コマンド

```bash
bun install          # 依存関係インストール
bun test tests/      # テスト実行
bun run src/index.ts # サーバー起動
```

## 開発原則

- TDD (テスト駆動開発)
- SOLID原則
- YAGNI
- DB不要、Escrow不要 — `@x402/express`のpaymentMiddlewareで決済自動処理
