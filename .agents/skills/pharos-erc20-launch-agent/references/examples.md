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

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend node --generate-liquidity --liquidity-token-amount 100000 --liquidity-native-amount 10 --output-dir .\demo-pharos-token-launch --install-project-scripts
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
$env:PRIVATE_KEY="..."
$env:TOKEN_ADDRESS="0xDeployedTokenAddress"
npm run add-liquidity
```

## Generate Bitverse V4 Liquidity Files

Bitverse is Pharos mainnet-only and uses Uniswap V4-style concentrated liquidity through PositionManager and Permit2.

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --deployer 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network mainnet --generate --backend node --generate-liquidity --liquidity-provider bitverse-v4 --liquidity-token-amount 100000 --liquidity-native-amount 0.5 --bitverse-tick-lower -887220 --bitverse-tick-upper 887220 --bitverse-position-liquidity 1000000000000000000 --output-dir .\demo-pharos-token-launch --install-project-scripts --confirm-mainnet
```

Generated Bitverse files:

- `add-bitverse-liquidity.mjs`
- `bitverse-v4-liquidity-plan.md`
- `npm run add-liquidity` inside the generated launch folder
- `npm run pharos:erc20:liquidity` from the project root when `--install-project-scripts` is used

After token deployment:

```powershell
cd .\demo-pharos-token-launch
npm install --no-audit --no-fund
$env:PRIVATE_KEY="..."
$env:TOKEN_ADDRESS="0xDeployedTokenAddress"
$env:BITVERSE_TICK_LOWER="-887220"
$env:BITVERSE_TICK_UPPER="887220"
$env:BITVERSE_POSITION_LIQUIDITY="1000000000000000000"
npm run add-liquidity
```

## Optional Deployment

Only run this after explicit confirmation from the user.

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
4. Run `--generate --backend node --generate-liquidity --liquidity-token-amount 100000 --liquidity-native-amount 10 --output-dir demo-pharos-token-launch --install-project-scripts`.
5. Open generated `launch-plan.md`, `faroswap-liquidity-plan.md`, `src/PharosLaunchToken.sol`, `deploy.mjs`, `add-liquidity.mjs`, generated `package.json`, project-root `package.json`, and `verification-checklist.md`.
6. Show that no private key is needed for planning or file generation.
7. Show the managed project-root commands: `npm run pharos:erc20:plan`, `npm run deploy`, and `npm run pharos:erc20:liquidity`.
8. Optionally show the guarded deploy command, but avoid exposing any private key in video.
