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
node .\.agents\skills\pharos-erc20-launch-agent\scripts\launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --deployer 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir "F:\Pharos\erc20-launch-demo"
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

## Requirements

- Node.js 18+ for planning and generation.
- Node.js deployment backend: `npm install` in the generated launch project.
- Foundry deployment backend: `forge` available in PATH.

## Supported Networks

- `atlantic-testnet`
- `mainnet`
