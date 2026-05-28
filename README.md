# Pharos ERC20 Launch Agent

Pharos ERC20 Launch Agent is a Codex / Pharos Agent Center-style skill for planning, generating, and optionally deploying ERC20 token launches on Pharos.

It is more than a quick deploy command: it validates token parameters, checks Pharos network readiness, estimates deployment cost, generates reviewable launch files, creates verification/post-launch materials, and supports both Foundry and Windows-friendly Node.js deployment paths.

## Features

- ERC20 launch plan for Pharos Atlantic testnet or mainnet.
- Token validation: name, symbol, decimals, supply, owner, deployer, network.
- Gas-readiness checks through public Pharos RPC.
- Standalone fixed-supply ERC20 contract generation.
- Foundry deployment project generation.
- Node.js deployment project generation with `ethers` and `solc`.
- Optional project-root npm scripts, so `npm run deploy` can call the guarded skill deploy flow from the project where the skill is installed.
- Optional FaroSwap liquidity planning and `add-liquidity.mjs` generation for V2-style token/native liquidity.
- Optional Bitverse V4 concentrated-liquidity planning and `add-bitverse-liquidity.mjs` generation for Pharos mainnet.
- Verification checklist with constructor values.
- Airdrop CSV starter template.
- Markdown, JSON, and console reports.
- Guarded deployment mode requiring explicit confirmation.

## Install

From a project where you want the skill installed:

```powershell
npx skills add https://github.com/Makssay/pharos-erc20-launch-agent
```

Manual install:

```powershell
New-Item -ItemType Directory -Force -Path .\.agents\skills | Out-Null
git clone https://github.com/Makssay/pharos-erc20-launch-agent temp-pharos-erc20-launch-agent
Copy-Item -Path .\temp-pharos-erc20-launch-agent\.agents\skills\pharos-erc20-launch-agent -Destination .\.agents\skills\ -Recurse -Force
```

## Quick Start

Plan a token launch:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --format console --no-color
```

Generate both Foundry and Node.js launch files:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --deployer 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir "F:\Pharos\erc20-launch-demo" --install-project-scripts
```

Generate a launch project with a FaroSwap liquidity step:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend node --generate-liquidity --liquidity-token-amount 100000 --liquidity-native-amount 10 --output-dir ".\erc20-launch-demo" --install-project-scripts
```

Generate a launch project with a Bitverse V4 liquidity step on mainnet:

```powershell
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --deployer 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network mainnet --generate --backend node --generate-liquidity --liquidity-provider bitverse-v4 --liquidity-token-amount 100000 --liquidity-native-amount 0.5 --bitverse-tick-lower -887220 --bitverse-tick-upper 887220 --bitverse-position-liquidity 1000000000000000000 --output-dir ".\erc20-launch-demo" --install-project-scripts --confirm-mainnet
```

Compile generated Node.js deployer:

```powershell
cd "F:\Pharos\erc20-launch-demo"
npm install --no-audit --no-fund
npm run compile-check
```

Deploy with Node.js after review:

```powershell
cd "F:\Pharos\erc20-launch-demo"
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
$env:RPC_URL="https://atlantic.dplabs-internal.com"
npm run deploy
```

Deploy with Node.js from the project where the skill is installed:

```powershell
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
npm run deploy
```

The project-root `npm run deploy` script is only installed when generation uses `--install-project-scripts`. If your project already has a `deploy` script, the skill keeps it and adds `npm run pharos:erc20:deploy` instead.

Add FaroSwap liquidity after deployment:

```powershell
cd "F:\Pharos\erc20-launch-demo"
npm install --no-audit --no-fund
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
$env:TOKEN_ADDRESS="0xDEPLOYED_TOKEN_ADDRESS"
npm run add-liquidity
```

Add Bitverse V4 liquidity after deployment:

```powershell
cd "F:\Pharos\erc20-launch-demo"
npm install --no-audit --no-fund
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
$env:TOKEN_ADDRESS="0xDEPLOYED_TOKEN_ADDRESS"
$env:BITVERSE_TICK_LOWER="-887220"
$env:BITVERSE_TICK_UPPER="887220"
$env:BITVERSE_POSITION_LIQUIDITY="1000000000000000000"
npm run add-liquidity
```

If project scripts were installed:

```powershell
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
npm run pharos:erc20:liquidity
```

Deploy with Foundry after review:

```powershell
cd "F:\Pharos\erc20-launch-demo"
$env:PRIVATE_KEY="0xYOUR_PRIVATE_KEY"
forge script script/DeployPharosLaunchToken.s.sol:DeployPharosLaunchToken --rpc-url https://atlantic.dplabs-internal.com --private-key $env:PRIVATE_KEY --broadcast --skip-simulation
```

## Agent Prompt

```text
Use Pharos ERC20 Launch Agent to prepare a safe ERC20 launch plan called Demo Pharos Token with symbol DPT, supply 1000000, owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 on Pharos Atlantic testnet. Generate both Foundry and Node.js launch files, but do not deploy.
```

## Safety

- Planning and file generation do not require private keys.
- Never commit private keys, `.env`, `node_modules`, broadcast artifacts, or `deployment-result.json`.
- Use Atlantic testnet before mainnet.
- Mainnet deployment should require explicit confirmation.
- Review generated Solidity, launch config, and verification checklist before broadcasting.
- Project-root `npm run deploy` is a wrapper around the same guarded skill command; it still requires `PRIVATE_KEY`.
- FaroSwap or Bitverse liquidity is a separate post-deploy action. Confirm router or PositionManager/Permit2, token address, amounts, tick range, slippage, and recipient before signing.

## Requirements

- Node.js 18+ for planning and generation.
- Node.js deployment backend: `npm install` in the generated launch project.
- Foundry deployment backend: `forge` available in PATH.

## Supported Networks

- `atlantic-testnet`
- `mainnet`
