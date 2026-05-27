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

## Demo Flow

1. Show the skill folder and `SKILL.md`.
2. Run `--help`.
3. Run a plan-only testnet launch plan.
4. Run `--generate --backend both --output-dir demo-pharos-token-launch`.
5. Open generated `launch-plan.md`, `src/PharosLaunchToken.sol`, `deploy.mjs`, `package.json`, and `verification-checklist.md`.
6. Show that no private key is needed for planning or file generation.
7. Show both deployment paths: Foundry and Node.js.
8. Optionally show the guarded deploy command, but avoid exposing any private key in video.
