# Safety Model

This skill is designed as a launch workflow, not a blind deploy command.

## Modes

- **Plan-only:** validate parameters and produce a launch plan. No private key required.
- **Generate:** create Solidity, Foundry, Node.js, verification, and post-launch files. No private key required.
- **Deploy with Foundry:** execute the generated `forge script` deployment path. Requires `forge`, explicit user confirmation, `--deploy --yes`, and `PRIVATE_KEY` in the local environment.
- **Deploy with Node.js:** run the generated `deploy.mjs` path using `ethers` and `solc`. Requires `npm install`, explicit user confirmation, and `PRIVATE_KEY` in the local environment.

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
9. Save Markdown/JSON reports for review.
10. Require explicit confirmation for write operations.

## Private Key Handling

- Do not ask for private keys during planning or generation.
- Do not write private keys to generated files.
- For deployment, prefer a local environment variable named `PRIVATE_KEY`.
- Do not print `PRIVATE_KEY`.
- Do not deploy to mainnet unless the user explicitly confirms mainnet deployment.
- Do not commit `node_modules`, `.env`, broadcast artifacts, or deployment files containing sensitive operational data.
