---
name: pharos-erc20-launch-agent
description: Plan, generate, and optionally deploy ERC20 token launches on Pharos with safety checks. Use when a user wants an ERC20 launch plan, token parameter validation, Pharos testnet/mainnet gas readiness, generated Solidity/Foundry/Node.js launch files, verification checklist, airdrop template, or a guarded ERC20 deployment workflow. Supports safe plan-only mode by default and requires explicit confirmation for write operations.
---

# Pharos ERC20 Launch Agent

Prepare a complete ERC20 launch workflow for Pharos instead of only deploying a token. The skill validates token parameters, checks network configuration, estimates deployment readiness, generates standalone ERC20 launch files for Foundry and/or Node.js, creates verification and post-launch files, and can optionally deploy after explicit confirmation.

## Default Workflow

1. Validate the requested token name, symbol, decimals, supply, owner, deployer, and target network.
2. Default to `atlantic-testnet` unless the user explicitly asks for `mainnet`.
3. Start with plan-only mode. Do not request a private key for planning or file generation.
4. Run the bundled script from the skill root:

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0x0000000000000000000000000000000000000000 --network atlantic-testnet
```

5. If the user wants launch files, add `--generate --output-dir <folder>`. By default this generates both Foundry and Node.js deployment paths.
6. Use `--backend foundry`, `--backend node`, or `--backend both` when the user wants a specific deployment backend.
7. If the user wants real deployment, stop and request explicit confirmation. Only run deployment with `--deploy --yes`; for mainnet also require `--confirm-mainnet`.

## Inputs

- `--name <token name>`: Required token name.
- `--symbol <symbol>`: Required token symbol.
- `--supply <amount>`: Required human token supply, for example `1000000` or `1000000.5`.
- `--decimals <n>`: Optional. Defaults to `18`; must be `0..36`, with warnings above `18`.
- `--owner <address>`: Optional token owner and initial supply recipient. If omitted, the generated deploy script uses the deployer.
- `--deployer <address>`: Optional deployer address used for gas readiness checks.
- `--network atlantic-testnet|mainnet`: Optional. Defaults to `atlantic-testnet`.
- `--rpc-url <url>`: Optional custom RPC endpoint.
- `--format markdown|json|console`: Optional. Defaults to `markdown`; can be inferred from `--output`.
- `--output <path>`: Optional report output file.
- `--generate`: Generate a launch project. Defaults to both Foundry and Node.js deploy paths.
- `--backend foundry|node|both`: Optional. Select generated deployment backend.
- `--generate-foundry`: Generate only Foundry launch files.
- `--generate-node`: Generate only Node.js deployer files.
- `--output-dir <path>`: Output directory for generated launch files.
- `--plan-only`: Force planning mode.
- `--offline` or `--skip-rpc`: Skip live RPC checks.
- `--deploy`: Execute the generated deployment script.
- `--deploy-backend foundry|node`: Optional. Defaults to `foundry`.
- `--yes`: Required with `--deploy` after explicit user confirmation.
- `--confirm-mainnet`: Required with `--deploy --network mainnet`.
- `--no-color`: Disable ANSI colors for console output.

## Generated Files

When `--generate` is used, the script creates:

- `src/PharosLaunchToken.sol`: standalone fixed-supply ERC20 contract with no external imports.
- `script/DeployPharosLaunchToken.s.sol`: Foundry deployment script.
- `foundry.toml`: minimal Foundry config.
- `package.json`: Node.js deployer dependencies and scripts.
- `deploy.mjs`: Node.js deployer using `ethers` and `solc`.
- `.env.example`: private-key and launch variable template.
- `.gitignore`: ignores private keys, node dependencies, and deployment artifacts.
- `launch-config.json`: machine-readable launch parameters.
- `launch-plan.md`: human-readable launch plan.
- `verification-checklist.md`: verification commands and checklist.
- `airdrop-template.csv`: starter CSV for post-launch distribution.
- `README.md`: generated project usage notes.

## Safety Rules

- Planning and generation are read-only and must not request private keys.
- Never write private keys to files.
- Node.js deployment requires `npm install` in the generated launch project before `npm run deploy`.
- Foundry deployment requires `forge` in PATH.
- Before any `--deploy`, confirm the token parameters, owner/deployer, network, and gas readiness with the user.
- Do not deploy to `mainnet` unless the user explicitly says mainnet and confirms the action.
- Use `--deploy --yes` only after explicit user confirmation in the current conversation.
- Use `--confirm-mainnet` only when the user explicitly confirms mainnet deployment.
- Prefer `atlantic-testnet` for demos and first launches.
- If RPC checks fail, report the failure and continue in plan mode; do not treat missing RPC data as approval to deploy.

## Examples

Read `references/examples.md` for demo commands and Discord/video flows. Read `references/safety.md` when preparing a real deployment or explaining why this launch agent is different from a simple Quick ERC20 deploy.
