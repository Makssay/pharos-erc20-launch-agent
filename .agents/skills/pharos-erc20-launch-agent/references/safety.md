# Safety Model

This skill is designed as a launch workflow, not a blind deploy command.

## Modes

- **Plan-only:** validate parameters and produce a launch plan. No private key required.
- **Generate:** create Solidity, Foundry, Node.js, verification, and post-launch files. No private key required.
- **Generate FaroSwap liquidity:** create a separate `add-liquidity.mjs` script and `faroswap-liquidity-plan.md`. No private key required.
- **Generate Bitverse V4 liquidity:** create a separate `add-bitverse-liquidity.mjs` script and `bitverse-v4-liquidity-plan.md`. No private key required. Requires Bitverse mainnet contracts, Permit2, a tick range, and raw V4 position liquidity before execution.
- **Deploy with Foundry:** execute the generated `forge script` deployment path. Requires `forge`, explicit user confirmation, `--deploy --yes`, and `PRIVATE_KEY` in the local environment.
- **Deploy with Node.js:** run the generated `deploy.mjs` path using `ethers` and `solc`. Can be launched from the skill project with `--output-dir <folder> --deploy --deploy-backend node --yes`; the script reads the generated `launch-config.json` and installs dependencies there when needed. If generation used `--install-project-scripts`, `npm run deploy` from the project root calls the same guarded command. Requires explicit user confirmation and `PRIVATE_KEY` in the local environment.
- **Add liquidity:** run the generated liquidity script after token deployment. Requires `PRIVATE_KEY`, the deployed token address, enough token/native balance, and explicit confirmation.

## Difference From Quick ERC20 Deploy

Quick ERC20 deployment focuses on sending one deployment transaction.

This launch agent covers the broader launch process:

1. Validate token metadata and supply.
2. Check Pharos network configuration.
3. Estimate gas readiness when a deployer is provided.
4. Produce a launch plan before deployment.
5. Generate reviewable Solidity and Foundry files.
6. Generate a Windows-friendly Node.js deployer for users without Foundry.
7. Generate verification commands and explorer links.
8. Generate airdrop starter files for post-launch distribution.
9. Generate an optional FaroSwap V2 or Bitverse V4 liquidity plan and script.
10. Save Markdown/JSON reports for review.
11. Require explicit confirmation for write operations.

## Private Key Handling

- Do not ask for private keys during planning or generation.
- Do not write private keys to generated files.
- For deployment, prefer a local environment variable named `PRIVATE_KEY`.
- Do not print `PRIVATE_KEY`.
- Treat project-root `npm run deploy` as a convenience wrapper only; it still requires `PRIVATE_KEY`, `--yes`, and mainnet confirmation logic inside the skill.
- Treat DEX liquidity as a post-deploy action, not ERC20 contract logic.
- Confirm router/PositionManager/Permit2 address, token address, token amount, native amount, slippage/tick range, and LP or position recipient before adding liquidity.
- For Bitverse V4, confirm the pool is initialized and the chosen tick range/position liquidity match the intended price range.
- Explain that liquidity can create impermanent-loss exposure and is irreversible once signed.
- Do not deploy to mainnet unless the user explicitly confirms mainnet deployment.
- Do not commit `node_modules`, `.env`, broadcast artifacts, or deployment files containing sensitive operational data.
