---
name: pharos-erc20-launch-agent
description: Plan, generate, and optionally deploy ERC20 token launches on Pharos with safety checks. Use when a user wants an ERC20 launch plan, token parameter validation, Pharos testnet/mainnet gas readiness, generated Solidity/Foundry/Node.js launch files, FaroSwap liquidity planning, verification checklist, airdrop template, or a guarded ERC20 deployment workflow. Supports safe plan-only mode by default and requires explicit confirmation for write operations.
---

# Pharos ERC20 Launch Agent

Prepare a complete ERC20 launch workflow for Pharos instead of only deploying a token. The skill validates token parameters, checks network configuration, estimates deployment readiness, generates standalone ERC20 launch files for Foundry and/or Node.js, can generate FaroSwap liquidity scripts, creates verification and post-launch files, and can optionally deploy after explicit confirmation.

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
7. If the user wants `npm run deploy` from the project where the skill is installed, add `--install-project-scripts` during generation. This creates or updates the current project's `package.json` with `pharos:erc20:*` scripts and a safe `deploy` alias when no conflicting deploy script exists.
8. If the user wants a FaroSwap liquidity step, add `--generate-liquidity --liquidity-token-amount <amount> --liquidity-native-amount <amount>` only for `mainnet`. FaroSwap liquidity adding is currently disabled on `atlantic-testnet`; if requested there, report that token deployment still works but add-liquidity is unavailable.
9. If the user wants real deployment or liquidity, stop and request explicit confirmation. Only run deployment with `--deploy --yes`; for mainnet also require `--confirm-mainnet`.

## Agent Execution Rules

- This skill is self-contained and supports a Node.js deployment path. Do not require Foundry, `forge`, `cast`, Bash, Git Bash, or WSL unless the user explicitly asks for the Foundry backend.
- If another generic Pharos skill says Foundry is mandatory, treat that as applying only to Foundry/cast workflows. For this ERC20 Launch Agent, prefer the bundled Node.js script with `ethers`, `solc`, and JSON-RPC.
- On Windows, use PowerShell-compatible commands and the Node.js backend by default.
- If the user asks to "generate, deploy" or "launch" a token and provides token params, infer `--generate --backend node --install-project-scripts --deploy --deploy-backend node --yes`. If the network is `mainnet`, also include `--confirm-mainnet`.
- If the user asks to add FaroSwap liquidity and the network is `mainnet`, infer `--generate-liquidity`, `--liquidity-token-amount`, `--liquidity-native-amount`, `--liquidity-slippage-bps`, and `--liquidity-recipient` from the prompt, then deploy first and run the generated liquidity command after deployment succeeds.
- If the user asks to add liquidity on `atlantic-testnet`, do not attempt the transaction. Explain that testnet liquidity is unavailable and that the generated script exits without sending a transaction.
- Use the local `PRIVATE_KEY` environment variable for deployment and liquidity. Check whether it exists, but never print or save it.
- Do not stop after checking for `forge` if Node.js is available. Continue with `--backend node`.
- Do not ask follow-up questions when the prompt already includes token name, symbol, supply, owner, deployer, network, and liquidity amounts.

## Command Mapping

For a mainnet token launch with liquidity, use this command shape from the project root where the skill is installed:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "<TOKEN_NAME>" --symbol <SYMBOL> --supply <SUPPLY> --owner <OWNER> --deployer <DEPLOYER> --network mainnet --generate --backend node --generate-liquidity --liquidity-token-amount <TOKEN_AMOUNT> --liquidity-native-amount <NATIVE_AMOUNT> --liquidity-slippage-bps <BPS> --liquidity-recipient <LP_RECIPIENT> --output-dir ".\<launch-folder>" --install-project-scripts --format console --confirm-mainnet
```

Then deploy with:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --output-dir ".\<launch-folder>" --deploy --deploy-backend node --yes --confirm-mainnet
```

After deployment succeeds, add liquidity from the project root if project scripts were installed:

```powershell
npm run pharos:erc20:liquidity
```

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
- `--install-project-scripts`: Optional. Add npm scripts to the current project so deployment can be started from the project where the skill is installed.
- `--force-project-scripts`: Optional. Allow the skill to replace an existing `deploy` npm script.
- `--liquidity-plan`: Optional. Add a liquidity plan to the report.
- `--generate-liquidity`: Optional. Generate `add-liquidity.mjs` and `faroswap-liquidity-plan.md`.
- `--liquidity-provider faroswap-v2`: Optional. Defaults to `faroswap-v2`.
- `--liquidity-token-amount <amount>`: Token amount to add to the liquidity pair.
- `--liquidity-native-amount <amount>`: Native PHRS/PROS amount to pair with the token.
- `--liquidity-router <address>`: FaroSwap router. Defaults to the configured mainnet router; `atlantic-testnet` liquidity is currently disabled even if a router is supplied.
- `--faroswap-fee-rate <integer>`: FaroSwap AMM V2 fee rate. Defaults to `30` on mainnet, based on the observed FaroSwap transaction path.
- `--liquidity-recipient <address>`: LP token recipient. Defaults to owner/deployer when available.
- `--liquidity-slippage-bps <bps>`: Slippage tolerance in basis points. Defaults to `100`.
- `--token-address <address>`: Existing deployed token address for liquidity when `deployment-result.json` is not present.
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
- `add-liquidity.mjs`: optional FaroSwap liquidity script when `--generate-liquidity` is used. On `atlantic-testnet`, the generated script exits with an unavailable message and sends no transaction.
- `faroswap-liquidity-plan.md`: optional liquidity review plan.
- Optional current-project `package.json` scripts when `--install-project-scripts` is used.

## Safety Rules

- Planning and generation are read-only and must not request private keys.
- Never write private keys to files.
- Node.js deployment can be managed from the skill project with `--deploy --deploy-backend node --output-dir <folder> --yes`; the script reads `launch-config.json` from the generated folder and installs Node dependencies there when needed.
- If `--install-project-scripts` was used, `npm run deploy` from the project root is just an alias to the guarded skill deployment command.
- Liquidity is generated as a separate post-deploy script. Do not hide liquidity, fees, or swap logic inside the ERC20 contract.
- FaroSwap liquidity adding is currently unavailable on `atlantic-testnet`; do not attempt to add liquidity there.
- FaroSwap liquidity uses a router call generated as a separate script. Validate router bytecode, token address, token/native amounts, slippage, and recipient before signing.
- Adding liquidity is a write operation and can expose the user to impermanent loss; require explicit user confirmation before running it.
- Foundry deployment requires `forge` in PATH.
- Before any `--deploy`, confirm the token parameters, owner/deployer, network, and gas readiness with the user.
- Do not deploy to `mainnet` unless the user explicitly says mainnet and confirms the action.
- Use `--deploy --yes` only after explicit user confirmation in the current conversation.
- Use `--confirm-mainnet` only when the user explicitly confirms mainnet deployment.
- Prefer `atlantic-testnet` for demos and first launches.
- If RPC checks fail, report the failure and continue in plan mode; do not treat missing RPC data as approval to deploy.

## Examples

Read `references/examples.md` for demo commands and Discord/video flows. Read `references/safety.md` when preparing a real deployment or explaining why this launch agent is different from a simple Quick ERC20 deploy.
