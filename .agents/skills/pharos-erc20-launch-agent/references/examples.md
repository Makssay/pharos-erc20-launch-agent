# Example Prompts

## Plan A Token Launch

```text
Use $pharos-erc20-launch-agent to plan an ERC20 launch called Demo Pharos Token with symbol DPT, supply 1000000, owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 on Pharos Atlantic testnet. Do not deploy.
```

Direct command:

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet
```

## Generate Launch Files

```text
Use $pharos-erc20-launch-agent to generate Foundry and Node.js launch files for Demo Pharos Token on Pharos Atlantic testnet.
```

Direct command:

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir demo-pharos-token-launch
```

Generate launch files and install project-level npm scripts:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend node --output-dir .\demo-pharos-token-launch --install-project-scripts
```

After that, from the same project root:

```powershell
npm run pharos:erc20:plan
$env:PRIVATE_KEY="..."
npm run deploy
```

Node.js-only generation for Windows/PowerShell:

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate-node --output-dir demo-pharos-token-launch
```

## Save Reports

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --output launch-plan.md
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --output launch-plan.json
```

## Console Demo

```bash
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --format console --offline
```

## Generate FaroSwap Liquidity Files

FaroSwap liquidity adding is currently disabled on `atlantic-testnet`. Use testnet for token deployment/testing, and generate liquidity files for `mainnet` after explicit review.

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network mainnet --generate --backend node --generate-liquidity --liquidity-token-amount 100000 --liquidity-native-amount 0.5 --output-dir .\demo-pharos-token-launch --install-project-scripts --confirm-mainnet
```

Generated liquidity files:

- `add-liquidity.mjs`
- `faroswap-liquidity-plan.md`
- `npm run add-liquidity` inside the generated launch folder
- `npm run pharos:erc20:liquidity` from the project root when `--install-project-scripts` is used

After token deployment:

```powershell
cd .\demo-pharos-token-launch
npm install --no-audit --no-fund
Copy-Item .env.example .env
# Edit .env and set PRIVATE_KEY. TOKEN_ADDRESS is optional when deployment-result.json exists.
$env:PRIVATE_KEY="..."
$env:TOKEN_ADDRESS="0xDeployedTokenAddress"
$env:RPC_URL="https://rpc.pharos.xyz"
npm run add-liquidity
```

## Optional Deployment

Only run this after explicit confirmation from the user.

## Minimal Agent Prompt For Mainnet Liquidity

```text
[$pharos-erc20-launch-agent](C:\\Users\\User\\.agents\\skills\\pharos-erc20-launch-agent\\SKILL.md)

generate, deploy, and add FaroSwap liquidity for an ERC20 token on Pharos mainnet.

Use the Node.js backend. Do not require Foundry, forge, cast, Bash, Git Bash, or WSL.

Token:
- Name: Token Name
- Symbol: CLLT
- Supply: 1000000
- Owner: 0xf337687dD73c1A13EFE39393a000f55a95B1ac54
- Deployer: 0xf337687dD73c1A13EFE39393a000f55a95B1ac54
- Network: mainnet

Liquidity:
- Pair: CLLT/PROS
- Token amount: 100000 CLLT
- Native amount: 0.5 PROS
- Slippage: 100 bps
- LP recipient: 0xf337687dD73c1A13EFE39393a000f55a95B1ac54
```

Before using this prompt for real deployment, set `PRIVATE_KEY` in the generated launch folder's `.env` file or as a local environment variable. Never include the private key in the prompt.

Expected agent behavior: use `--backend node`, `--deploy-backend node`, `--generate-liquidity`, `--install-project-scripts`, and `--confirm-mainnet`. Do not require Foundry unless the prompt explicitly asks for Foundry.

Foundry backend:

```powershell
$env:PRIVATE_KEY="..."
node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --deployer 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir demo-pharos-token-launch --deploy --deploy-backend foundry --yes
```

Node.js backend:

```powershell
cd demo-pharos-token-launch
npm install --no-audit --no-fund
$env:PRIVATE_KEY="..."
$env:RPC_URL="https://atlantic.dplabs-internal.com"
npm run deploy
```

Managed Node.js deployment from the project where the skill is installed:

```powershell
$env:PRIVATE_KEY="..."
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --output-dir demo-pharos-token-launch --deploy --deploy-backend node --yes
```

If the project was generated with `--install-project-scripts`, the managed deployment command is also available as:

```powershell
$env:PRIVATE_KEY="..."
npm run deploy
```

## Demo Flow

1. Show the skill folder and `SKILL.md`.
2. Run `--help`.
3. Run a plan-only testnet launch plan.
4. Run `--generate --backend node --output-dir demo-pharos-token-launch --install-project-scripts` on `atlantic-testnet`.
5. Optionally run the same command with `--generate-liquidity` on `atlantic-testnet` to show the safety message that testnet liquidity is unavailable.
6. Open generated `launch-plan.md`, `src/PharosLaunchToken.sol`, `deploy.mjs`, generated `package.json`, project-root `package.json`, and `verification-checklist.md`.
7. For liquidity, show a separate `mainnet --generate-liquidity` plan and open `faroswap-liquidity-plan.md` without signing transactions.
8. Show that no private key is needed for planning or file generation.
9. Show the managed project-root commands: `npm run pharos:erc20:plan`, `npm run deploy`, and, for mainnet liquidity projects, `npm run pharos:erc20:liquidity`.
10. Optionally show the guarded deploy command, but avoid exposing any private key in video.
