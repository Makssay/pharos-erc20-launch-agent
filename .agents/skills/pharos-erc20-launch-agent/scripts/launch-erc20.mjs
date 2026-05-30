#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const NETWORKS_PATH = path.join(SKILL_ROOT, "assets", "networks.json");
const DEFAULT_DEPLOY_GAS = 1600000n;
const DEFAULT_LIQUIDITY_GAS = 450000n;
const DEFAULT_LIQUIDITY_SLIPPAGE_BPS = 100;
const DEFAULT_LIQUIDITY_DEADLINE_MINUTES = 20;
const DEFAULT_LIQUIDITY_PROVIDER = "faroswap-v2";
const DEFAULT_FAROSWAP_FEE_RATE = 30;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m"
};

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const existingLaunchConfig = loadExistingLaunchConfig(args.outputDir);
  if (existingLaunchConfig) {
    hydrateArgsFromLaunchConfig(args, existingLaunchConfig);
  }

  const networkConfig = loadNetworkConfig();
  const network = resolveNetwork(networkConfig, args.network);
  if (args.rpcUrl) network.rpcUrl = args.rpcUrl;

  const token = buildTokenSpec(args);
  const plan = createBasePlan(args, network, token);

  addStaticChecks(plan, args, network, token);
  if (!args.offline) {
    await addRpcChecks(plan, args, network);
  } else {
    addCheck(plan, "WARN", "RPC checks skipped by --offline/--skip-rpc.");
  }
  addEstimates(plan, args, network);
  addRecommendations(plan, args, token);

  if (args.generate || args.outputDir || args.deploy) {
    const outputDir = args.outputDir || defaultOutputDir(token);
    const generated = generateLaunchProject(outputDir, args, network, token, plan);
    plan.mode = args.deploy ? "deploy" : "generate";
    plan.generatedFiles = generated.files;
    plan.generatedProjectDir = path.resolve(outputDir);
    plan.commands = generated.commands;
    addCheck(plan, "OK", `Generated launch project: ${path.basename(path.resolve(outputDir))}.`);
    if (args.installProjectScripts) {
      const projectScripts = installProjectScripts(outputDir, args, network);
      plan.projectScripts = projectScripts;
      addCheck(plan, projectScripts.deployScriptInstalled ? "OK" : "WARN", projectScripts.message);
    }
    fs.writeFileSync(path.join(plan.generatedProjectDir, "launch-plan.md"), renderMarkdown(plan), "utf8");
    if (!plan.generatedFiles.includes("launch-plan.md")) plan.generatedFiles.push("launch-plan.md");
  }

  if (args.deploy) {
    const deployment = runDeploy(args, network);
    plan.deployment = deployment;
    if (deployment.status === 0) {
      addCheck(plan, "OK", `${args.deployBackend} deployment command completed.`);
    } else {
      addCheck(plan, "FAIL", `${args.deployBackend} deployment command failed. Review stderr/stdout in the report.`);
    }
  }

  const rendered = renderPlan(plan, args);
  if (args.output) {
    fs.writeFileSync(args.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
    if (!rendered.endsWith("\n")) process.stdout.write("\n");
  }
}

function parseArgs(argv) {
  const args = {
    network: null,
    decimals: "18",
    format: null,
    output: null,
    outputDir: null,
    generate: false,
    deploy: false,
    yes: false,
    confirmMainnet: false,
    offline: false,
    noColor: false,
    contractName: "PharosLaunchToken",
    backend: null,
    generateFoundry: false,
    generateNode: false,
    deployBackend: null,
    deployBackendExplicit: false,
    installProjectScripts: false,
    forceProjectScripts: false,
    liquidityPlan: false,
    generateLiquidity: false,
    liquidityProvider: null,
    liquidityRouter: null,
    liquidityTokenAmount: null,
    liquidityNativeAmount: null,
    liquidityRecipient: null,
    liquiditySlippageBps: String(DEFAULT_LIQUIDITY_SLIPPAGE_BPS),
    liquidityDeadlineMinutes: String(DEFAULT_LIQUIDITY_DEADLINE_MINUTES),
    faroswapFeeRate: null,
    tokenAddress: null,
    planOnly: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--help":
      case "-h":
        args.help = true;
        break;
      case "--name":
        args.name = readValue(argv, ++i, arg);
        break;
      case "--symbol":
        args.symbol = readValue(argv, ++i, arg);
        break;
      case "--supply":
        args.supply = readValue(argv, ++i, arg);
        break;
      case "--decimals":
        args.decimals = readValue(argv, ++i, arg);
        break;
      case "--owner":
        args.owner = readValue(argv, ++i, arg);
        break;
      case "--deployer":
        args.deployer = readValue(argv, ++i, arg);
        break;
      case "--network":
        args.network = readValue(argv, ++i, arg);
        break;
      case "--rpc-url":
        args.rpcUrl = readValue(argv, ++i, arg);
        break;
      case "--format":
        args.format = readValue(argv, ++i, arg);
        break;
      case "--output":
        args.output = readValue(argv, ++i, arg);
        break;
      case "--output-dir":
        args.outputDir = readValue(argv, ++i, arg);
        break;
      case "--contract-name":
        args.contractName = readValue(argv, ++i, arg);
        break;
      case "--backend":
      case "--generate-backend":
        args.backend = readValue(argv, ++i, arg);
        args.generate = true;
        break;
      case "--generate-foundry":
        args.generate = true;
        args.generateFoundry = true;
        break;
      case "--generate-node":
        args.generate = true;
        args.generateNode = true;
        break;
      case "--deploy-backend":
        args.deployBackend = readValue(argv, ++i, arg);
        args.deployBackendExplicit = true;
        break;
      case "--install-project-scripts":
      case "--install-npm-scripts":
        args.installProjectScripts = true;
        break;
      case "--force-project-scripts":
        args.installProjectScripts = true;
        args.forceProjectScripts = true;
        break;
      case "--liquidity-plan":
      case "--faroswap-liquidity-plan":
        args.liquidityPlan = true;
        break;
      case "--liquidity-provider":
        args.liquidityProvider = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--generate-liquidity":
      case "--generate-faroswap-liquidity":
        args.generate = true;
        args.generateLiquidity = true;
        break;
      case "--liquidity-router":
      case "--faroswap-router":
        args.liquidityRouter = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--liquidity-token-amount":
        args.liquidityTokenAmount = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--liquidity-native-amount":
        args.liquidityNativeAmount = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--liquidity-recipient":
      case "--lp-recipient":
        args.liquidityRecipient = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--liquidity-slippage-bps":
      case "--slippage-bps":
        args.liquiditySlippageBps = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--liquidity-deadline-minutes":
        args.liquidityDeadlineMinutes = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--faroswap-fee-rate":
      case "--amm-v2-fee-rate":
        args.faroswapFeeRate = readValue(argv, ++i, arg);
        args.liquidityProvider = "faroswap-v2";
        args.liquidityPlan = true;
        break;
      case "--token-address":
        args.tokenAddress = readValue(argv, ++i, arg);
        args.liquidityPlan = true;
        break;
      case "--generate":
        args.generate = true;
        break;
      case "--plan-only":
        args.planOnly = true;
        break;
      case "--deploy":
        args.deploy = true;
        args.generate = true;
        break;
      case "--yes":
        args.yes = true;
        break;
      case "--confirm-mainnet":
      case "--force-mainnet":
        args.confirmMainnet = true;
        break;
      case "--offline":
      case "--skip-rpc":
        args.offline = true;
        break;
      case "--no-color":
        args.noColor = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.format && args.output) args.format = inferFormat(args.output);
  if (!args.format) args.format = "markdown";
  if (!["markdown", "json", "console"].includes(args.format)) {
    throw new Error("--format must be markdown, json, or console");
  }
  if (args.planOnly && args.deploy) throw new Error("--plan-only cannot be combined with --deploy");
  args.backends = resolveBackends(args);
  if (args.deployBackend && !["foundry", "node"].includes(args.deployBackend)) {
    throw new Error("--deploy-backend must be foundry or node");
  }
  if (!args.deployBackend) args.deployBackend = args.backends.length === 1 ? args.backends[0] : "foundry";
  if (args.deploy && !args.backends.includes(args.deployBackend)) args.backends.push(args.deployBackend);
  if (args.generateLiquidity && !args.backends.includes("node")) args.backends.push("node");
  return args;
}

function readValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function resolveBackends(args) {
  if (args.backend) {
    if (args.backend === "both") return ["foundry", "node"];
    if (args.backend === "foundry") return ["foundry"];
    if (args.backend === "node") return ["node"];
    throw new Error("--backend must be foundry, node, or both");
  }
  const selected = [];
  if (args.generateFoundry) selected.push("foundry");
  if (args.generateNode) selected.push("node");
  return selected.length ? selected : ["foundry", "node"];
}

function inferFormat(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".json") return "json";
  if (ext === ".txt" || ext === ".console") return "console";
  return "markdown";
}

function printHelp() {
  process.stdout.write(`Pharos ERC20 Launch Agent

Usage:
  node scripts/launch-erc20.mjs --name "Demo Token" --symbol DPT --supply 1000000 --owner 0x... --network atlantic-testnet

Required:
  --name <name>             Token name
  --symbol <symbol>         Token symbol
  --supply <amount>         Human supply amount, e.g. 1000000

Options:
  --decimals <n>            Token decimals, default 18
  --owner <address>         Token owner and initial supply recipient
  --deployer <address>      Deployer address for gas readiness checks
  --network <name>          atlantic-testnet or mainnet
  --rpc-url <url>           Custom RPC URL
  --format <type>           markdown, json, or console
  --output <path>           Save report
  --generate                Generate launch files for both Foundry and Node.js
  --backend <type>          foundry, node, or both; default both for generation
  --generate-foundry        Generate only Foundry launch files
  --generate-node           Generate only Node.js deployer files
  --output-dir <path>       Launch project output directory
  --offline, --skip-rpc     Skip live RPC checks
  --deploy                  Execute generated deployment script
  --deploy-backend <type>   foundry or node; default foundry
  --install-project-scripts Add npm scripts to the current project package.json
  --force-project-scripts   Allow overwriting an existing deploy script
  --liquidity-plan          Add a liquidity plan
  --generate-liquidity      Generate Node.js add-liquidity script
  --liquidity-provider      faroswap-v2
  --liquidity-token-amount  Token amount to pair with native PHRS/PROS
  --liquidity-native-amount Native amount to pair with token
  --liquidity-router <addr> FaroSwap router; testnet liquidity is disabled
  --faroswap-fee-rate       FaroSwap AMM V2 fee rate, default 30 on mainnet
  --liquidity-recipient     LP token recipient; defaults to owner/deployer
  --liquidity-slippage-bps  Slippage in basis points, default 100
  --token-address <addr>    Existing deployed token address for liquidity
  --yes                     Required with --deploy
  --confirm-mainnet         Required with --deploy --network mainnet
  --no-color                Disable console colors

Examples:
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir demo-pharos-token-launch
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir demo-pharos-token-launch --install-project-scripts
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network mainnet --generate --backend node --generate-liquidity --liquidity-token-amount 100000 --liquidity-native-amount 0.5 --output-dir demo-pharos-token-launch --confirm-mainnet
  node scripts/launch-erc20.mjs --output-dir demo-pharos-token-launch --deploy --deploy-backend node --yes
`);
}

function loadExistingLaunchConfig(outputDir) {
  if (!outputDir) return null;
  const configPath = path.join(path.resolve(outputDir), "launch-config.json");
  if (!fs.existsSync(configPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read existing launch-config.json: ${error.message}`);
  }
}

function hydrateArgsFromLaunchConfig(args, config) {
  const requestedNetwork = args.network || null;
  const configNetwork = config.network?.name || null;
  const sameConfigNetwork = !requestedNetwork || !configNetwork || requestedNetwork === configNetwork;

  if (!args.name && config.token?.name) args.name = config.token.name;
  if (!args.symbol && config.token?.symbol) args.symbol = config.token.symbol;
  if (!args.supply && config.token?.supplyInput) args.supply = config.token.supplyInput;
  if ((!args.decimals || args.decimals === "18") && config.token?.decimals !== undefined) args.decimals = String(config.token.decimals);
  if ((!args.contractName || args.contractName === "PharosLaunchToken") && config.token?.contractName) args.contractName = config.token.contractName;
  if (!args.owner && config.owner && config.owner !== "deployer") args.owner = config.owner;
  if (!args.deployer && config.deployer) args.deployer = config.deployer;
  if (!args.network && config.network?.name) args.network = config.network.name;
  if (!args.rpcUrl && sameConfigNetwork && config.network?.rpcUrl) args.rpcUrl = config.network.rpcUrl;
  if (!args.tokenAddress && sameConfigNetwork && config.tokenAddress) args.tokenAddress = config.tokenAddress;
  if (config.liquidity) {
    if (!args.liquidityPlan && !args.generateLiquidity) args.liquidityPlan = true;
    if (!args.generateLiquidity) args.generateLiquidity = true;
    if (!args.liquidityProvider && config.liquidity.protocol) args.liquidityProvider = config.liquidity.protocol;
    if (!args.liquidityRouter && sameConfigNetwork && config.liquidity.router) args.liquidityRouter = config.liquidity.router;
    if (!args.liquidityTokenAmount && config.liquidity.tokenAmountInput) args.liquidityTokenAmount = config.liquidity.tokenAmountInput;
    if (!args.liquidityNativeAmount && config.liquidity.nativeAmountInput) args.liquidityNativeAmount = config.liquidity.nativeAmountInput;
    if (!args.liquidityRecipient && config.liquidity.recipient) args.liquidityRecipient = config.liquidity.recipient;
    if ((!args.liquiditySlippageBps || args.liquiditySlippageBps === String(DEFAULT_LIQUIDITY_SLIPPAGE_BPS)) && config.liquidity.slippageBps !== undefined) args.liquiditySlippageBps = String(config.liquidity.slippageBps);
    if ((!args.liquidityDeadlineMinutes || args.liquidityDeadlineMinutes === String(DEFAULT_LIQUIDITY_DEADLINE_MINUTES)) && config.liquidity.deadlineMinutes !== undefined) args.liquidityDeadlineMinutes = String(config.liquidity.deadlineMinutes);
    if (!args.faroswapFeeRate && config.liquidity.feeRate !== undefined && config.liquidity.feeRate !== null) args.faroswapFeeRate = String(config.liquidity.feeRate);
  }
  if (Array.isArray(config.backends) && config.backends.length && !args.backend && !args.generateFoundry && !args.generateNode) {
    args.backends = config.backends.filter((backend) => backend === "foundry" || backend === "node");
  }
  if (args.generateLiquidity && !args.backends.includes("node")) args.backends.push("node");
  if (!args.deployBackendExplicit && config.deployment?.deployBackend) {
    args.deployBackend = config.deployment.deployBackend;
  }
  if (!args.deployBackendExplicit) {
    args.deployBackend = args.backends.length === 1 ? args.backends[0] : "foundry";
  }
  if (args.deploy && !args.backends.includes(args.deployBackend)) args.backends.push(args.deployBackend);
}

function loadNetworkConfig() {
  return JSON.parse(fs.readFileSync(NETWORKS_PATH, "utf8"));
}

function resolveNetwork(config, requested) {
  const name = requested || config.defaultNetwork || "atlantic-testnet";
  const found = config.networks.find((network) => network.name === name);
  if (!found) throw new Error(`Unsupported network "${name}". Supported: ${config.networks.map((n) => n.name).join(", ")}`);
  return { ...found };
}

function buildTokenSpec(args) {
  if (!args.name) throw new Error("--name is required");
  if (!args.symbol) throw new Error("--symbol is required");
  if (!args.supply) throw new Error("--supply is required");

  const name = args.name.trim();
  const symbol = args.symbol.trim();
  if (!name) throw new Error("Token name cannot be empty");
  if (name.length > 80) throw new Error("Token name is too long; keep it at 80 characters or less");
  if (!/^[\x20-\x7E]+$/.test(name)) throw new Error("Token name must use printable ASCII for safe Solidity generation");
  if (!/^[A-Za-z0-9]{1,12}$/.test(symbol)) throw new Error("Token symbol must be 1-12 letters/digits");

  const decimals = Number.parseInt(String(args.decimals), 10);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 36) {
    throw new Error("--decimals must be an integer from 0 to 36");
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.contractName)) {
    throw new Error("--contract-name must be a valid Solidity identifier");
  }

  return {
    name,
    symbol,
    decimals,
    supplyInput: normalizeAmountString(args.supply),
    initialSupplyBaseUnits: parseSupply(args.supply, decimals).toString(),
    contractName: args.contractName
  };
}

function normalizeAmountString(value) {
  return String(value).trim().replace(/[,_\s]/g, "");
}

function parseSupply(value, decimals) {
  return parseDecimalUnits(value, decimals, "--supply");
}

function parseDecimalUnits(value, decimals, label) {
  const normalized = normalizeAmountString(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error(`${label} must be a positive decimal number`);
  const fraction = match[2] || "";
  if (fraction.length > decimals) {
    throw new Error(`${label} has ${fraction.length} decimal places but decimals is ${decimals}`);
  }
  const scale = 10n ** BigInt(decimals);
  const total = BigInt(match[1]) * scale + (fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n);
  if (total <= 0n) throw new Error(`${label} must be greater than zero`);
  return total;
}

function parseInteger(value, label, min, max) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be an integer`);
  const parsed = Number.parseInt(String(value), 10);
  if (parsed < min || parsed > max) throw new Error(`${label} must be between ${min} and ${max}`);
  return parsed;
}

function buildLiquiditySpec(args, network, token) {
  const requested = args.liquidityPlan ||
    args.generateLiquidity ||
    args.liquidityProvider ||
    args.liquidityRouter ||
    args.liquidityTokenAmount ||
    args.liquidityNativeAmount ||
    args.liquidityRecipient ||
    args.tokenAddress;
  if (!requested) return null;

  const provider = args.liquidityProvider || DEFAULT_LIQUIDITY_PROVIDER;
  if (provider === "faroswap" || provider === "faroswap-v2") return buildFaroSwapLiquiditySpec(args, network, token);
  throw new Error("--liquidity-provider must be faroswap-v2");
}

function buildFaroSwapLiquiditySpec(args, network, token) {
  const router = args.liquidityRouter || network.faroswap?.ammV2Router || network.faroswap?.uniswapV2Router02 || null;
  const routerKind = network.faroswap?.routerKind || (network.faroswap?.ammV2Router ? "faroswap-amm-v2" : "uniswap-v2");
  const available = isFaroSwapLiquidityAvailable(network);
  const tokenAmountBaseUnits = args.liquidityTokenAmount ? parseDecimalUnits(args.liquidityTokenAmount, token.decimals, "--liquidity-token-amount").toString() : null;
  const nativeAmountWei = args.liquidityNativeAmount ? parseDecimalUnits(args.liquidityNativeAmount, 18, "--liquidity-native-amount").toString() : null;
  const slippageBps = parseInteger(args.liquiditySlippageBps, "--liquidity-slippage-bps", 0, 5000);
  const deadlineMinutes = parseInteger(args.liquidityDeadlineMinutes, "--liquidity-deadline-minutes", 1, 1440);
  const feeRate = parseInteger(args.faroswapFeeRate || network.faroswap?.defaultFeeRate || DEFAULT_FAROSWAP_FEE_RATE, "--faroswap-fee-rate", 0, 10000);
  const recipient = args.liquidityRecipient || args.owner || args.deployer || null;

  return {
    protocol: "faroswap-v2",
    pair: `${token.symbol}/${network.nativeToken}`,
    available,
    unavailableReason: available ? null : faroSwapLiquidityUnavailableReason(network),
    router,
    routerKind,
    routerSource: args.liquidityRouter ? "cli" : network.faroswap?.ammV2Router ? "faroswap-mainnet-tx" : network.faroswap?.uniswapV2Router02 ? "faroswap-docs" : "missing",
    factory: network.faroswap?.ammV2Factory || network.faroswap?.uniswapV2Factory || null,
    wrappedNative: network.faroswap?.wrappedNative || null,
    feeRate,
    tokenAddress: args.tokenAddress || null,
    tokenAmountInput: args.liquidityTokenAmount || null,
    tokenAmountBaseUnits,
    nativeAmountInput: args.liquidityNativeAmount || null,
    nativeAmountWei,
    recipient,
    slippageBps,
    deadlineMinutes,
    nativeToken: network.nativeToken,
    docs: network.faroswap?.docs || "https://docs.faroswap.xyz/en/developer/contracts-integration"
  };
}

function isFaroSwapLiquidityAvailable(network) {
  return network.name !== "atlantic-testnet" && network.faroswap?.liquidityAvailable !== false;
}

function faroSwapLiquidityUnavailableReason(network) {
  return network.faroswap?.unavailableReason ||
    `FaroSwap liquidity adding is currently unavailable on ${network.name}. Token deployment can still be tested, but add-liquidity is disabled for this network.`;
}

function createBasePlan(args, network, token) {
  return {
    generatedAt: new Date().toISOString(),
    mode: "plan",
    network: {
      name: network.name,
      chainId: network.chainId,
      rpcUrl: network.rpcUrl,
      explorerUrl: network.explorerUrl,
      explorerApiUrl: network.explorerApiUrl,
      nativeToken: network.nativeToken,
      faroswap: network.faroswap || null
    },
    token,
    tokenAddress: args.tokenAddress || null,
    liquidity: buildLiquiditySpec(args, network, token),
    backends: args.backends,
    deployBackend: args.deployBackend,
    addresses: {
      owner: args.owner || null,
      deployer: args.deployer || null
    },
    checks: [],
    estimates: {},
    recommendations: [],
    generatedFiles: [],
    commands: {}
  };
}

function addStaticChecks(plan, args, network, token) {
  addCheck(plan, "OK", "Token name is present and Solidity-safe.");
  addCheck(plan, "OK", "Token symbol is present and Solidity-safe.");
  addCheck(plan, "OK", `Initial supply parsed as ${token.initialSupplyBaseUnits} base units.`);
  addCheck(plan, token.symbol === token.symbol.toUpperCase() ? "OK" : "WARN", token.symbol === token.symbol.toUpperCase() ? "Token symbol uses conventional uppercase style." : "Token symbol contains lowercase letters; uppercase symbols are more conventional.");
  addCheck(plan, token.decimals <= 18 ? "OK" : "WARN", token.decimals <= 18 ? `Token decimals set to ${token.decimals}.` : "Decimals above 18 can confuse wallets, explorers, and users.");

  if (args.owner) addCheck(plan, ADDRESS_RE.test(args.owner) ? "OK" : "FAIL", ADDRESS_RE.test(args.owner) ? "Owner address format is valid." : "Owner address is invalid. Expected 0x plus 40 hex characters.");
  else addCheck(plan, "WARN", "No owner provided; generated deployment will use the deployer as token owner.");

  if (args.deployer) addCheck(plan, ADDRESS_RE.test(args.deployer) ? "OK" : "FAIL", ADDRESS_RE.test(args.deployer) ? "Deployer address format is valid." : "Deployer address is invalid. Expected 0x plus 40 hex characters.");
  else addCheck(plan, "WARN", "No deployer provided; gas readiness can only be estimated after a deployer is known.");

  addCheck(plan, network.name === "mainnet" ? (args.confirmMainnet ? "OK" : "WARN") : "OK", network.name === "mainnet" ? "Target network is Pharos mainnet." : "Target network is testnet-friendly for launch demos.");
  addCheck(plan, "OK", `Launch project backend selection: ${args.backends.join(", ")}.`);
  if (args.deploy) addCheck(plan, "OK", `Deployment backend selected: ${args.deployBackend}.`);
  if (plan.liquidity) addLiquidityChecks(plan, args, network, token);

  if (args.deploy) {
    if (!args.yes) addCheck(plan, "FAIL", "Deployment mode requires --yes after explicit user confirmation.");
    if (network.name === "mainnet" && !args.confirmMainnet) addCheck(plan, "FAIL", "Mainnet deployment requires --confirm-mainnet.");
    if (!process.env.PRIVATE_KEY) addCheck(plan, "FAIL", "Deployment mode requires PRIVATE_KEY in the local environment.");
  }
}

function addLiquidityChecks(plan, args, network, token) {
  const liquidity = plan.liquidity;
  addCheck(plan, "OK", `${liquidityDisplayName(liquidity)} liquidity plan enabled for ${liquidity.pair}.`);
  addFaroSwapLiquidityChecks(plan, args, network, token, liquidity);
}

function addFaroSwapLiquidityChecks(plan, args, network, token, liquidity) {
  if (liquidity.available === false) {
    addCheck(plan, "FAIL", liquidity.unavailableReason);
    if (args.generateLiquidity) addCheck(plan, "WARN", "Generated add-liquidity script will exit with this message instead of sending a transaction.");
    return;
  }
  if (liquidity.router) addCheck(plan, ADDRESS_RE.test(liquidity.router) ? "OK" : "FAIL", ADDRESS_RE.test(liquidity.router) ? `FaroSwap V2 router selected: ${compactAddress(liquidity.router)} (${liquidity.routerKind}).` : "Liquidity router is invalid. Expected 0x plus 40 hex characters.");
  else addCheck(plan, "FAIL", "No FaroSwap V2 router is known for this network. Pass --liquidity-router explicitly.");
  if (network.name !== "atlantic-testnet" && network.name !== "mainnet" && !args.liquidityRouter) addCheck(plan, "WARN", "FaroSwap default router is only configured for known Pharos networks; custom networks require an explicit reviewed router.");
  if (liquidity.routerKind === "faroswap-amm-v2") addCheck(plan, "OK", `FaroSwap AMM V2 fee rate set to ${liquidity.feeRate}.`);
  if (liquidity.tokenAddress) addCheck(plan, ADDRESS_RE.test(liquidity.tokenAddress) ? "OK" : "FAIL", ADDRESS_RE.test(liquidity.tokenAddress) ? `Existing token address provided: ${compactAddress(liquidity.tokenAddress)}.` : "Token address is invalid. Expected 0x plus 40 hex characters.");
  else addCheck(plan, "WARN", "No token address provided yet; add-liquidity script will read TOKEN_ADDRESS or deployment-result.json after deployment.");
  if (liquidity.tokenAmountBaseUnits) addCheck(plan, BigInt(liquidity.tokenAmountBaseUnits) <= BigInt(token.initialSupplyBaseUnits) ? "OK" : "FAIL", BigInt(liquidity.tokenAmountBaseUnits) <= BigInt(token.initialSupplyBaseUnits) ? `Liquidity token amount planned: ${liquidity.tokenAmountInput} ${token.symbol}.` : "Liquidity token amount is larger than initial supply.");
  else addCheck(plan, "FAIL", "--liquidity-token-amount is required for a concrete liquidity script.");
  if (liquidity.nativeAmountWei) addCheck(plan, "OK", `Liquidity native amount planned: ${liquidity.nativeAmountInput} ${network.nativeToken}.`);
  else addCheck(plan, "FAIL", "--liquidity-native-amount is required for a concrete liquidity script.");
  if (liquidity.recipient) addCheck(plan, ADDRESS_RE.test(liquidity.recipient) ? "OK" : "FAIL", ADDRESS_RE.test(liquidity.recipient) ? `LP recipient selected: ${compactAddress(liquidity.recipient)}.` : "Liquidity recipient is invalid. Expected 0x plus 40 hex characters.");
  else addCheck(plan, "WARN", "No liquidity recipient provided; generated script will use the deployer wallet.");
  addCheck(plan, "OK", `Liquidity slippage set to ${liquidity.slippageBps} bps.`);
  if (args.generateLiquidity && !args.backends.includes("node")) addCheck(plan, "FAIL", "FaroSwap liquidity generation requires the Node.js backend.");
}

async function addRpcChecks(plan, args, network) {
  if (!network.rpcUrl) {
    addCheck(plan, "WARN", "No RPC URL available; live network checks skipped.");
    return;
  }
  try {
    const chainIdHex = await rpc(network.rpcUrl, "eth_chainId", []);
    const chainId = Number.parseInt(chainIdHex, 16);
    plan.rpc = { ...(plan.rpc || {}), chainId };
    addCheck(plan, chainId === network.chainId ? "OK" : "FAIL", chainId === network.chainId ? `RPC chain ID matches ${network.chainId}.` : `RPC chain ID mismatch: expected ${network.chainId}, got ${chainId}.`);
  } catch (error) {
    addCheck(plan, "WARN", `RPC chain ID check unavailable: ${error.message}`);
  }

  try {
    const gasPriceHex = await rpc(network.rpcUrl, "eth_gasPrice", []);
    const gasPriceWei = BigInt(gasPriceHex);
    plan.estimates.gasPriceWei = gasPriceWei.toString();
    addCheck(plan, "OK", `Gas price fetched: ${gasPriceWei.toString()} wei.`);
  } catch (error) {
    addCheck(plan, "WARN", `Gas price check unavailable: ${error.message}`);
  }

  if (args.deployer && ADDRESS_RE.test(args.deployer)) {
    try {
      const balanceHex = await rpc(network.rpcUrl, "eth_getBalance", [args.deployer, "latest"]);
      const balanceWei = BigInt(balanceHex);
      plan.estimates.deployerBalanceWei = balanceWei.toString();
      addCheck(plan, "OK", `Deployer balance fetched: ${formatUnits(balanceWei, 18, 6)} ${network.nativeToken}.`);
    } catch (error) {
      addCheck(plan, "WARN", `Deployer balance check unavailable: ${error.message}`);
    }
  }

  if (plan.liquidity?.protocol === "faroswap-v2" && plan.liquidity.available !== false && plan.liquidity.router && ADDRESS_RE.test(plan.liquidity.router)) {
    try {
      const routerCode = await rpc(network.rpcUrl, "eth_getCode", [plan.liquidity.router, "latest"]);
      addCheck(plan, routerCode && routerCode !== "0x" ? "OK" : "FAIL", routerCode && routerCode !== "0x" ? "FaroSwap router bytecode exists on the selected network." : "FaroSwap router address has no contract bytecode on the selected network.");
    } catch (error) {
      addCheck(plan, "WARN", `FaroSwap router bytecode check unavailable: ${error.message}`);
    }
  }
}

async function rpc(url, method, params) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal
    });
    const json = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (json.error) throw new Error(json.error.message || JSON.stringify(json.error));
    return json.result;
  } finally {
    clearTimeout(timeout);
  }
}

function addEstimates(plan, args, network) {
  const gasPriceWei = plan.estimates.gasPriceWei ? BigInt(plan.estimates.gasPriceWei) : 10000000000n;
  const estimatedCostWei = gasPriceWei * DEFAULT_DEPLOY_GAS;
  plan.estimates.deployGasLimit = DEFAULT_DEPLOY_GAS.toString();
  plan.estimates.estimatedDeployCostWei = estimatedCostWei.toString();
  plan.estimates.estimatedDeployCostNative = formatUnits(estimatedCostWei, 18, 8);
  if (plan.liquidity && plan.liquidity.available !== false) {
    const liquidityCostWei = gasPriceWei * DEFAULT_LIQUIDITY_GAS;
    plan.estimates.liquidityGasLimit = DEFAULT_LIQUIDITY_GAS.toString();
    plan.estimates.estimatedLiquidityGasCostWei = liquidityCostWei.toString();
    plan.estimates.estimatedLiquidityGasCostNative = formatUnits(liquidityCostWei, 18, 8);
  }

  if (plan.estimates.deployerBalanceWei) {
    const balance = BigInt(plan.estimates.deployerBalanceWei);
    addCheck(plan, balance >= estimatedCostWei ? "OK" : "FAIL", balance >= estimatedCostWei ? `Deployer appears gas-ready for an estimated ${plan.estimates.estimatedDeployCostNative} ${network.nativeToken} deployment cost.` : `Deployer balance is below estimated deployment cost of ${plan.estimates.estimatedDeployCostNative} ${network.nativeToken}.`);
  } else if (args.deployer) {
    addCheck(plan, "WARN", "Could not compare deployer balance to estimated deployment cost.");
  }
}

function addRecommendations(plan, args, token) {
  if (!args.owner) plan.recommendations.push("Set --owner explicitly if the token owner should differ from the deployer.");
  if (!args.deployer) plan.recommendations.push("Set --deployer to check gas readiness before deployment.");
  if (token.decimals > 18) plan.recommendations.push("Use 18 decimals or less unless there is a strong reason.");
  if (!args.generate && !args.deploy) plan.recommendations.push("Use --generate --output-dir <folder> to create reviewable launch files.");
  if (plan.liquidity) {
    if (plan.liquidity.available === false) {
      plan.recommendations.push("Omit --generate-liquidity on atlantic-testnet; deploy and test the token there, then use mainnet for FaroSwap liquidity after explicit confirmation.");
    } else {
      plan.recommendations.push(`Review ${liquidityDisplayName(plan.liquidity)} contract addresses and liquidity amounts before adding liquidity.`);
      plan.recommendations.push("Add liquidity only after the ERC20 deployment result and token balance are confirmed.");
    }
  }
  if (plan.network.name === "mainnet") plan.recommendations.push("Run the same launch on atlantic-testnet before mainnet deployment.");
  plan.recommendations.push("Review generated Solidity and verification commands before deployment.");
}

function addCheck(plan, status, message) {
  plan.checks.push({ status, message });
}

function defaultOutputDir(token) {
  return `pharos-${token.symbol.toLowerCase()}-erc20-launch`;
}

function generateLaunchProject(outputDir, args, network, token) {
  const root = path.resolve(outputDir);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });

  const ownerLiteral = args.owner && ADDRESS_RE.test(args.owner) ? args.owner : ZERO_ADDRESS;
  const files = [
    writeFile(root, `src/${token.contractName}.sol`, renderTokenContract(token.contractName)),
    writeFile(root, ".env.example", renderEnvExample(network, args)),
    writeFile(root, ".gitignore", renderGeneratedGitignore()),
    writeFile(root, "launch-config.json", `${JSON.stringify(buildLaunchConfig(args, network, token), null, 2)}\n`),
    writeFile(root, "verification-checklist.md", renderVerificationChecklist(network, token, ownerLiteral)),
    writeFile(root, "airdrop-template.csv", "address,amount\n0x0000000000000000000000000000000000000000,100\n")
  ];

  if (args.backends.includes("foundry")) {
    files.push(writeFile(root, "script/DeployPharosLaunchToken.s.sol", renderDeployScript(token, ownerLiteral)));
    files.push(writeFile(root, "foundry.toml", renderFoundryToml()));
  }
  if (args.backends.includes("node")) {
    const liquidity = args.generateLiquidity ? buildLiquiditySpec(args, network, token) : null;
    files.push(writeFile(root, "package.json", renderPackageJson(token, Boolean(args.generateLiquidity))));
    files.push(writeFile(root, "deploy.mjs", renderNodeDeployer(network, token, ownerLiteral)));
    if (args.generateLiquidity) {
      if (!args.liquidityPlan) args.liquidityPlan = true;
      files.push(writeFile(root, "add-liquidity.mjs", renderFaroSwapLiquidityScript(network, token, liquidity)));
      files.push(writeFile(root, "faroswap-liquidity-plan.md", renderFaroSwapLiquidityPlan(network, token, liquidity)));
    }
  }

  const liquidity = args.generateLiquidity ? buildLiquiditySpec(args, network, token) : null;
  files.push(writeFile(root, "README.md", renderGeneratedReadme(network, token, args.backends, Boolean(args.generateLiquidity))));
  return { files, commands: buildCommands(network, args.backends, Boolean(args.generateLiquidity)) };
}

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  return relativePath;
}

function installProjectScripts(outputDir, args, network) {
  const projectRoot = process.cwd();
  const packagePath = path.join(projectRoot, "package.json");
  const existed = fs.existsSync(packagePath);
  let pkg;
  if (existed) {
    try {
      pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    } catch (error) {
      throw new Error(`Could not read project package.json: ${error.message}`);
    }
  } else {
    pkg = {
      name: npmSafeName(path.basename(projectRoot) || "pharos-erc20-project"),
      private: true,
      scripts: {}
    };
  }

  if (!pkg || typeof pkg !== "object" || Array.isArray(pkg)) throw new Error("Project package.json must contain a JSON object");
  if (!pkg.scripts || typeof pkg.scripts !== "object" || Array.isArray(pkg.scripts)) pkg.scripts = {};

  const skillScript = projectRelativeScriptPath(projectRoot);
  const launchDir = projectRelativePath(projectRoot, path.resolve(outputDir));
  const baseCommand = `node ${quoteNpmArg(skillScript)} --output-dir ${quoteNpmArg(launchDir)}`;
  const mainnetFlag = network.name === "mainnet" ? " --confirm-mainnet" : "";
  const deployCommand = `${baseCommand} --deploy --deploy-backend node --yes${mainnetFlag}`;

  pkg.scripts["pharos:erc20:plan"] = `${baseCommand} --format console`;
  pkg.scripts["pharos:erc20:deploy"] = deployCommand;
  if (args.generateLiquidity) {
    pkg.scripts["pharos:erc20:liquidity"] = `cd ${quoteNpmArg(launchDir)} && npm run add-liquidity`;
  }

  const existingDeploy = pkg.scripts.deploy;
  const deployOwnedBySkill = typeof existingDeploy === "string" && existingDeploy.includes("pharos:erc20:deploy");
  let deployScriptInstalled = false;
  if (!existingDeploy || deployOwnedBySkill || args.forceProjectScripts) {
    pkg.scripts.deploy = "npm run pharos:erc20:deploy";
    deployScriptInstalled = true;
  }

  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  return {
    packageJson: packagePath,
    launchDir,
    scripts: {
      "pharos:erc20:plan": pkg.scripts["pharos:erc20:plan"],
      "pharos:erc20:deploy": pkg.scripts["pharos:erc20:deploy"],
      "pharos:erc20:liquidity": pkg.scripts["pharos:erc20:liquidity"] || null,
      deploy: deployScriptInstalled ? pkg.scripts.deploy : existingDeploy
    },
    deployScriptInstalled,
    message: deployScriptInstalled
      ? "Installed project npm scripts: npm run deploy and npm run pharos:erc20:deploy."
      : "Installed pharos npm scripts, but kept existing deploy script. Use npm run pharos:erc20:deploy or pass --force-project-scripts."
  };
}

function projectRelativeScriptPath(projectRoot) {
  const installedSkillScript = path.join(projectRoot, ".agents", "skills", "pharos-erc20-launch-agent", "scripts", "launch-erc20.mjs");
  if (fs.existsSync(installedSkillScript)) return projectRelativePath(projectRoot, installedSkillScript);
  return projectRelativePath(projectRoot, fileURLToPath(import.meta.url));
}

function projectRelativePath(projectRoot, targetPath) {
  const relative = path.relative(projectRoot, targetPath);
  if (!relative) return ".";
  const withDot = relative.startsWith("..") ? relative : `.${path.sep}${relative}`;
  return toNpmPath(withDot);
}

function quoteNpmArg(value) {
  const text = toNpmPath(value);
  return /[\s"]/u.test(text) ? JSON.stringify(text) : text;
}

function toNpmPath(value) {
  return String(value).replace(/\\/g, "/");
}

function npmSafeName(value) {
  const cleaned = String(value).toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "pharos-erc20-project";
}

function renderTokenContract(contractName) {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ${contractName} {
    string public name;
    string public symbol;
    uint8 public immutable decimals;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed holder, address indexed spender, uint256 value);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 initialSupply_,
        address initialOwner_
    ) {
        require(bytes(name_).length > 0, "empty name");
        require(bytes(symbol_).length > 0, "empty symbol");
        require(decimals_ <= 36, "decimals too high");
        require(initialSupply_ > 0, "zero supply");

        address recipient = initialOwner_ == address(0) ? msg.sender : initialOwner_;
        require(recipient != address(0), "zero owner");

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        owner = recipient;
        emit OwnershipTransferred(address(0), recipient);
        _mint(recipient, initialSupply_);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        require(spender != address(0), "zero spender");
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 currentAllowance = allowance[from][msg.sender];
        require(currentAllowance >= amount, "allowance");
        unchecked {
            allowance[from][msg.sender] = currentAllowance - amount;
        }
        _transfer(from, to, amount);
        emit Approval(from, msg.sender, allowance[from][msg.sender]);
        return true;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero owner");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "zero recipient");
        uint256 fromBalance = balanceOf[from];
        require(fromBalance >= amount, "balance");
        unchecked {
            balanceOf[from] = fromBalance - amount;
        }
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }
}
`;
}

function renderDeployScript(token, ownerLiteral) {
  return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../src/${token.contractName}.sol";

interface Vm {
    function startBroadcast() external;
    function stopBroadcast() external;
}

abstract contract MinimalScript {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));
}

contract DeployPharosLaunchToken is MinimalScript {
    function run() external returns (${token.contractName} token) {
        string memory tokenName = "${escapeSolidityString(token.name)}";
        string memory tokenSymbol = "${escapeSolidityString(token.symbol)}";
        uint8 tokenDecimals = ${token.decimals};
        uint256 initialSupply = ${token.initialSupplyBaseUnits};
        address tokenOwner = ${ownerLiteral};

        vm.startBroadcast();
        token = new ${token.contractName}(tokenName, tokenSymbol, tokenDecimals, initialSupply, tokenOwner);
        vm.stopBroadcast();
    }
}
`;
}

function renderFoundryToml() {
  return `[profile.default]
src = "src"
out = "out"
script = "script"
solc_version = "0.8.20"
optimizer = true
optimizer_runs = 200
`;
}

function renderEnvExample(network, args) {
  return `# Never commit real private keys.
PRIVATE_KEY=
RPC_URL=${args.rpcUrl || network.rpcUrl}
`;
}

function renderGeneratedGitignore() {
  return `node_modules/
.env
out/
cache/
broadcast/
deployment-result.json
liquidity-result.json
*.log
`;
}

function buildLaunchConfig(args, network, token) {
  const liquidity = buildLiquiditySpec(args, network, token);
  return {
    generatedAt: new Date().toISOString(),
    network,
    token,
    tokenAddress: args.tokenAddress || null,
    liquidity,
    backends: args.backends,
    owner: args.owner || "deployer",
    deployer: args.deployer || null,
    deployment: {
      deployBackend: args.deployBackend,
      commands: buildCommands(network, args.backends, Boolean(args.generateLiquidity))
    }
  };
}

function buildCommands(network, backends = ["foundry", "node"], includeLiquidity = false) {
  const commands = { powershell: [], bash: [] };
  if (backends.includes("foundry")) {
    commands.foundry = {
      powershell: [
        "$env:PRIVATE_KEY=\"paste_private_key_here\"",
        `forge script script/DeployPharosLaunchToken.s.sol:DeployPharosLaunchToken --rpc-url ${network.rpcUrl} --private-key $env:PRIVATE_KEY --broadcast --skip-simulation`
      ],
      bash: [
        "export PRIVATE_KEY=\"paste_private_key_here\"",
        `forge script script/DeployPharosLaunchToken.s.sol:DeployPharosLaunchToken --rpc-url ${network.rpcUrl} --private-key $PRIVATE_KEY --broadcast --skip-simulation`
      ]
    };
    commands.powershell.push("# Foundry deploy", ...commands.foundry.powershell);
    commands.bash.push("# Foundry deploy", ...commands.foundry.bash);
  }
  if (backends.includes("node")) {
    commands.node = {
      powershell: [
        "npm install --no-audit --no-fund",
        "$env:PRIVATE_KEY=\"paste_private_key_here\"",
        `$env:RPC_URL=\"${network.rpcUrl}\"`,
        "npm run deploy"
      ],
      bash: [
        "npm install --no-audit --no-fund",
        "export PRIVATE_KEY=\"paste_private_key_here\"",
        `export RPC_URL=\"${network.rpcUrl}\"`,
        "npm run deploy"
      ]
    };
    if (commands.powershell.length) commands.powershell.push("");
    if (commands.bash.length) commands.bash.push("");
    commands.powershell.push("# Node.js deployer", ...commands.node.powershell);
    commands.bash.push("# Node.js deployer", ...commands.node.bash);
  }
  if (includeLiquidity) {
    const liquidityAvailable = isFaroSwapLiquidityAvailable(network);
    commands.liquidity = {
      powershell: [
        ...(liquidityAvailable ? [] : [
          "# FaroSwap liquidity is currently unavailable on this network.",
          "# npm run add-liquidity will exit with an explanation and will not send a transaction."
        ]),
        "npm install --no-audit --no-fund",
        "$env:PRIVATE_KEY=\"paste_private_key_here\"",
        "# Optional if deployment-result.json is not present:",
        "$env:TOKEN_ADDRESS=\"0xDeployedTokenAddress\"",
        `$env:RPC_URL=\"${network.rpcUrl}\"`,
        "npm run add-liquidity"
      ],
      bash: [
        ...(liquidityAvailable ? [] : [
          "# FaroSwap liquidity is currently unavailable on this network.",
          "# npm run add-liquidity will exit with an explanation and will not send a transaction."
        ]),
        "npm install --no-audit --no-fund",
        "export PRIVATE_KEY=\"paste_private_key_here\"",
        "# Optional if deployment-result.json is not present:",
        "export TOKEN_ADDRESS=\"0xDeployedTokenAddress\"",
        `export RPC_URL=\"${network.rpcUrl}\"`,
        "npm run add-liquidity"
      ]
    };
    if (commands.powershell.length) commands.powershell.push("");
    if (commands.bash.length) commands.bash.push("");
    commands.powershell.push("# FaroSwap liquidity", ...commands.liquidity.powershell);
    commands.bash.push("# FaroSwap liquidity", ...commands.liquidity.bash);
  }
  return commands;
}

function renderPackageJson(token, includeLiquidity = false) {
  const scripts = {
    "compile-check": "node deploy.mjs --compile-only",
    deploy: "node deploy.mjs"
  };
  if (includeLiquidity) {
    scripts["add-liquidity"] = "node add-liquidity.mjs";
  }
  return `${JSON.stringify({
    name: npmPackageName(token),
    private: true,
    type: "module",
    scripts,
    dependencies: {
      ethers: "^6.13.5",
      solc: "^0.8.20"
    }
  }, null, 2)}\n`;
}

function npmPackageName(token) {
  return `pharos-${token.symbol.toLowerCase().replace(/[^a-z0-9-]/g, "-")}-erc20-launch`;
}

function renderNodeDeployer(network, token, ownerLiteral) {
  return `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import solc from "solc";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_NAME = "${token.contractName}.sol";
const SOURCE_PATH = path.join(__dirname, "src", SOURCE_NAME);
const ZERO_ADDRESS = "${ZERO_ADDRESS}";
const COMPILE_ONLY = process.argv.includes("--compile-only");

const NETWORK = {
  name: "${network.name}",
  chainId: ${network.chainId},
  rpcUrl: process.env.RPC_URL || "${network.rpcUrl}",
  explorerUrl: "${network.explorerUrl}"
};

const TOKEN = {
  contractName: "${token.contractName}",
  name: "${escapeJsString(token.name)}",
  symbol: "${escapeJsString(token.symbol)}",
  decimals: ${token.decimals},
  initialSupplyBaseUnits: "${token.initialSupplyBaseUnits}",
  owner: "${ownerLiteral}"
};

main().catch((error) => {
  console.error("Deploy failed:", error.message);
  process.exit(1);
});

async function main() {
  const compiled = compileContract();
  console.log("Compile ok:", TOKEN.contractName);
  console.log("Bytecode bytes:", (compiled.bytecode.length - 2) / 2);

  if (COMPILE_ONLY) return;
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required in the local environment");

  const provider = new ethers.JsonRpcProvider(NETWORK.rpcUrl);
  const connectedNetwork = await provider.getNetwork();
  if (Number(connectedNetwork.chainId) !== NETWORK.chainId) {
    throw new Error("Wrong chain: expected " + NETWORK.chainId + ", got " + connectedNetwork.chainId.toString());
  }

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const owner = TOKEN.owner === ZERO_ADDRESS ? wallet.address : TOKEN.owner;
  const balance = await provider.getBalance(wallet.address);
  console.log("Network:", NETWORK.name, NETWORK.chainId);
  console.log("Deployer:", wallet.address);
  console.log("Owner:", owner);
  console.log("Native balance:", ethers.formatEther(balance));

  const factory = new ethers.ContractFactory(compiled.abi, compiled.bytecode, wallet);
  const contract = await factory.deploy(
    TOKEN.name,
    TOKEN.symbol,
    TOKEN.decimals,
    BigInt(TOKEN.initialSupplyBaseUnits),
    owner
  );

  const tx = contract.deploymentTransaction();
  console.log("Deployment tx:", tx.hash);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await tx.wait();
  const explorerBase = NETWORK.explorerUrl.replace(/\\/$/, "");

  const report = {
    generatedAt: new Date().toISOString(),
    network: NETWORK,
    token: TOKEN,
    contractAddress: address,
    transactionHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    gasUsed: receipt?.gasUsed?.toString() ?? null,
    deployer: wallet.address,
    owner,
    explorerAddressUrl: explorerBase + "/address/" + address,
    explorerTxUrl: explorerBase + "/tx/" + tx.hash
  };

  fs.writeFileSync(path.join(__dirname, "deployment-result.json"), JSON.stringify(report, bigintJsonReplacer, 2) + "\\n", "utf8");
  console.log("Token address:", address);
  console.log("Explorer:", report.explorerAddressUrl);
  console.log("Saved: deployment-result.json");
}

function compileContract() {
  const source = fs.readFileSync(SOURCE_PATH, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [SOURCE_NAME]: { content: source }
    },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"]
        }
      }
    }
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input)));
  const messages = output.errors || [];
  for (const message of messages) {
    const severity = message.severity === "error" ? "ERROR" : "WARN";
    console.error("[" + severity + "] " + message.formattedMessage.trim());
  }
  if (messages.some((message) => message.severity === "error")) throw new Error("Solidity compilation failed");

  const contract = output.contracts?.[SOURCE_NAME]?.[TOKEN.contractName];
  if (!contract?.abi || !contract?.evm?.bytecode?.object) {
    throw new Error("Compiled artifact not found for " + TOKEN.contractName);
  }
  return { abi: contract.abi, bytecode: "0x" + contract.evm.bytecode.object };
}

function bigintJsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
`;
}

function renderFaroSwapLiquidityScript(network, token, liquidity) {
  if (liquidity.available === false) return renderUnavailableLiquidityScript(network, token, liquidity);

  const networkJson = JSON.stringify({
    name: network.name,
    chainId: network.chainId,
    rpcUrl: network.rpcUrl,
    explorerUrl: network.explorerUrl,
    nativeToken: network.nativeToken
  }, null, 2);
  const tokenJson = JSON.stringify({
    contractName: token.contractName,
    symbol: token.symbol,
    decimals: token.decimals
  }, null, 2);
  const liquidityJson = JSON.stringify(liquidity, null, 2);
  return `#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NETWORK = ${networkJson};
const TOKEN = ${tokenJson};
const LIQUIDITY = ${liquidityJson};

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address,address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)"
];

const ROUTER_ABI = [
  "function addLiquidityETH(address token,uint256 feeRate,uint256 amountTokenDesired,uint256 amountTokenMin,uint256 amountETHMin,address to,uint256 deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)",
  "function addLiquidityETH(address token,uint amountTokenDesired,uint amountTokenMin,uint amountETHMin,address to,uint deadline) payable returns (uint amountToken,uint amountETH,uint liquidity)"
];

main().catch((error) => {
  console.error("Liquidity add failed:", error.message);
  process.exit(1);
});

async function main() {
  if (LIQUIDITY.available === false || NETWORK.name === "atlantic-testnet") {
    throw new Error(LIQUIDITY.unavailableReason || "FaroSwap liquidity adding is currently unavailable on " + NETWORK.name + ". Token deployment can still be tested, but add-liquidity is disabled for this network.");
  }
  if (!process.env.PRIVATE_KEY) throw new Error("PRIVATE_KEY is required in the local environment");
  if (!LIQUIDITY.router || !ethers.isAddress(LIQUIDITY.router)) throw new Error("Valid FaroSwap router address is required");
  if (!LIQUIDITY.tokenAmountBaseUnits) throw new Error("liquidity token amount is missing in launch-config.json");
  if (!LIQUIDITY.nativeAmountWei) throw new Error("liquidity native amount is missing in launch-config.json");

  const tokenAddress = resolveTokenAddress();
  if (!ethers.isAddress(tokenAddress)) throw new Error("Valid TOKEN_ADDRESS or deployment-result.json contractAddress is required");

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || NETWORK.rpcUrl);
  const connectedNetwork = await provider.getNetwork();
  if (Number(connectedNetwork.chainId) !== NETWORK.chainId) {
    throw new Error("Wrong chain: expected " + NETWORK.chainId + ", got " + connectedNetwork.chainId.toString());
  }

  const routerCode = await provider.getCode(LIQUIDITY.router);
  if (!routerCode || routerCode === "0x") {
    throw new Error("FaroSwap router address has no contract code on " + NETWORK.name + ": " + LIQUIDITY.router);
  }

  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, wallet);
  const router = new ethers.Contract(LIQUIDITY.router, ROUTER_ABI, wallet);
  const recipient = LIQUIDITY.recipient && ethers.isAddress(LIQUIDITY.recipient) ? LIQUIDITY.recipient : wallet.address;
  const tokenAmount = BigInt(LIQUIDITY.tokenAmountBaseUnits);
  const nativeAmount = BigInt(LIQUIDITY.nativeAmountWei);
  const slippageBps = BigInt(LIQUIDITY.slippageBps);
  const minToken = tokenAmount * (10000n - slippageBps) / 10000n;
  const minNative = nativeAmount * (10000n - slippageBps) / 10000n;
  const deadline = Math.floor(Date.now() / 1000) + Number(LIQUIDITY.deadlineMinutes) * 60;

  const tokenCode = await provider.getCode(tokenAddress);
  if (!tokenCode || tokenCode === "0x") throw new Error("Token address has no contract code: " + tokenAddress);

  const tokenBalance = await tokenContract.balanceOf(wallet.address);
  if (tokenBalance < tokenAmount) throw new Error("Wallet token balance is below planned liquidity token amount");
  const nativeBalance = await provider.getBalance(wallet.address);
  if (nativeBalance <= nativeAmount) throw new Error("Wallet native balance is not enough for liquidity plus gas");

  const allowance = await tokenContract.allowance(wallet.address, LIQUIDITY.router);
  if (allowance < tokenAmount) {
    console.log("Approving FaroSwap router...");
    const approveTx = await tokenContract.approve(LIQUIDITY.router, tokenAmount);
    console.log("Approve tx:", approveTx.hash);
    await approveTx.wait();
  }

  const isFaroSwapAmmV2 = LIQUIDITY.routerKind === "faroswap-amm-v2";
  const gasEstimate = isFaroSwapAmmV2
    ? await router["addLiquidityETH(address,uint256,uint256,uint256,uint256,address,uint256)"].estimateGas(
        tokenAddress,
        BigInt(LIQUIDITY.feeRate),
        tokenAmount,
        minToken,
        minNative,
        recipient,
        deadline,
        { value: nativeAmount }
      )
    : await router["addLiquidityETH(address,uint256,uint256,uint256,address,uint256)"].estimateGas(
        tokenAddress,
        tokenAmount,
        minToken,
        minNative,
        recipient,
        deadline,
        { value: nativeAmount }
      );

  console.log("Network:", NETWORK.name, NETWORK.chainId);
  console.log("Token:", tokenAddress);
  console.log("Router:", LIQUIDITY.router);
  console.log("Router kind:", LIQUIDITY.routerKind || "uniswap-v2");
  if (isFaroSwapAmmV2) console.log("FaroSwap fee rate:", LIQUIDITY.feeRate);
  console.log("Recipient:", recipient);
  console.log("Token amount:", tokenAmount.toString());
  console.log("Native amount:", nativeAmount.toString());
  console.log("Gas estimate:", gasEstimate.toString());

  const tx = isFaroSwapAmmV2
    ? await router["addLiquidityETH(address,uint256,uint256,uint256,uint256,address,uint256)"](
        tokenAddress,
        BigInt(LIQUIDITY.feeRate),
        tokenAmount,
        minToken,
        minNative,
        recipient,
        deadline,
        {
          value: nativeAmount,
          gasLimit: gasEstimate * 120n / 100n
        }
      )
    : await router["addLiquidityETH(address,uint256,uint256,uint256,address,uint256)"](
        tokenAddress,
        tokenAmount,
        minToken,
        minNative,
        recipient,
        deadline,
        {
          value: nativeAmount,
          gasLimit: gasEstimate * 120n / 100n
        }
      );
  console.log("Liquidity tx:", tx.hash);
  const receipt = await tx.wait();

  const explorerBase = NETWORK.explorerUrl.replace(/\\/$/, "");
  const report = {
    generatedAt: new Date().toISOString(),
    network: NETWORK,
    token: TOKEN,
    tokenAddress,
    router: LIQUIDITY.router,
    routerKind: LIQUIDITY.routerKind || "uniswap-v2",
    feeRate: LIQUIDITY.feeRate ?? null,
    recipient,
    tokenAmount: tokenAmount.toString(),
    nativeAmount: nativeAmount.toString(),
    minToken: minToken.toString(),
    minNative: minNative.toString(),
    slippageBps: Number(slippageBps),
    transactionHash: tx.hash,
    blockNumber: receipt?.blockNumber ?? null,
    gasUsed: receipt?.gasUsed?.toString() ?? null,
    explorerTxUrl: explorerBase + "/tx/" + tx.hash
  };
  fs.writeFileSync(path.join(__dirname, "liquidity-result.json"), JSON.stringify(report, bigintJsonReplacer, 2) + "\\n", "utf8");
  console.log("Explorer:", report.explorerTxUrl);
  console.log("Saved: liquidity-result.json");
}

function resolveTokenAddress() {
  if (process.env.TOKEN_ADDRESS) return process.env.TOKEN_ADDRESS;
  const deploymentPath = path.join(__dirname, "deployment-result.json");
  if (fs.existsSync(deploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    if (deployment.contractAddress) return deployment.contractAddress;
  }
  if (LIQUIDITY.tokenAddress) return LIQUIDITY.tokenAddress;
  throw new Error("Set TOKEN_ADDRESS or run token deployment first so deployment-result.json exists");
}

function bigintJsonReplacer(_key, value) {
  return typeof value === "bigint" ? value.toString() : value;
}
`;
}

function renderUnavailableLiquidityScript(network, token, liquidity) {
  return `#!/usr/bin/env node
console.error("Liquidity add unavailable:", ${JSON.stringify(liquidity.unavailableReason)});
console.error("Network:", ${JSON.stringify(network.name)});
console.error("Token:", ${JSON.stringify(token.symbol)});
console.error("No transaction was sent.");
process.exit(1);
`;
}

function renderFaroSwapLiquidityPlan(network, token, liquidity) {
  const usageBlock = liquidity.available === false
    ? `## Usage

FaroSwap liquidity adding is currently disabled for ${network.name}. The generated \`add-liquidity.mjs\` script will exit with this message before requesting a private key or sending any transaction:

\`\`\`text
${liquidity.unavailableReason}
\`\`\`

Deploy and test the ERC20 on ${network.name}, then use Pharos mainnet for FaroSwap liquidity after explicit confirmation.
`
    : `## Usage

After ERC20 deployment, either keep \`deployment-result.json\` in this folder or set \`TOKEN_ADDRESS\`.

\`\`\`powershell
npm install --no-audit --no-fund
$env:PRIVATE_KEY="paste_private_key_here"
$env:TOKEN_ADDRESS="0xDeployedTokenAddress"
npm run add-liquidity
\`\`\`
`;
  return `# FaroSwap Liquidity Plan

Protocol: FaroSwap V2-style liquidity
Network: ${network.name}
Status: ${liquidity.available === false ? "unavailable on this network" : "available after deployment"}
${liquidity.available === false ? `Reason: ${liquidity.unavailableReason}` : ""}
Router: ${liquidity.router || "missing"}
Router kind: ${liquidity.routerKind || "uniswap-v2"}
Fee rate: ${liquidity.routerKind === "faroswap-amm-v2" ? liquidity.feeRate : "not used"}
Pair: ${liquidity.pair}

## Amounts

- Token amount: ${liquidity.tokenAmountInput || "missing"} ${token.symbol}
- Token base units: ${liquidity.tokenAmountBaseUnits || "missing"}
- Native amount: ${liquidity.nativeAmountInput || "missing"} ${network.nativeToken}
- Native wei: ${liquidity.nativeAmountWei || "missing"}
- Slippage: ${liquidity.slippageBps} bps
- LP recipient: ${liquidity.recipient || "deployer wallet"}

${usageBlock}

## Safety

- On ${network.name}, respect the status above before attempting liquidity.
- Confirm the FaroSwap router address before signing.
- Confirm token and native amounts before signing.
- Adding liquidity is a real write operation and can expose you to impermanent loss.
- Never commit \`.env\`, private keys, \`deployment-result.json\`, or \`liquidity-result.json\`.
`;
}

function renderVerificationChecklist(network, token, ownerLiteral) {
  const constructorArgs = `$(cast abi-encode "constructor(string,string,uint8,uint256,address)" "${escapeShell(token.name)}" "${escapeShell(token.symbol)}" ${token.decimals} ${token.initialSupplyBaseUnits} ${ownerLiteral})`;
  return `# Verification Checklist

Network: ${network.name}
Chain ID: ${network.chainId}
Explorer: ${network.explorerUrl}
Explorer API: ${network.explorerApiUrl}

Constructor values:

- Name: ${token.name}
- Symbol: ${token.symbol}
- Decimals: ${token.decimals}
- Initial supply base units: ${token.initialSupplyBaseUnits}
- Owner: ${ownerLiteral === ZERO_ADDRESS ? "deployer" : ownerLiteral}

If Foundry is available, wait about 10 seconds for explorer indexing after deployment, then verify:

\`\`\`bash
forge verify-contract <deployed_token_address> src/${token.contractName}.sol:${token.contractName} \\
  --chain-id ${network.chainId} \\
  --verifier blockscout \\
  --verifier-url ${network.explorerApiUrl}/v1/explorer/command_api/contract \\
  --constructor-args ${constructorArgs}
\`\`\`

If Foundry is not available, use the explorer UI and the same constructor values above.

Checklist:

- Confirm deployed contract address.
- Confirm token name, symbol, decimals, and total supply on explorer.
- Confirm initial holder/owner.
- Confirm source verification matches compiler settings from foundry.toml or package.json.
- Save the deployment transaction hash and explorer link.
`;
}

function renderGeneratedReadme(network, token, backends = ["foundry", "node"], includeLiquidity = false) {
  const commands = buildCommands(network, backends, includeLiquidity);
  const sections = [];
  sections.push(`# ${token.name} ERC20 Launch Project

Generated by Pharos ERC20 Launch Agent.

## Token

- Name: ${token.name}
- Symbol: ${token.symbol}
- Decimals: ${token.decimals}
- Initial supply base units: ${token.initialSupplyBaseUnits}
- Network: ${network.name}
`);

  if (commands.foundry) {
    sections.push(`## Deploy With Foundry

PowerShell:

\`\`\`powershell
${commands.foundry.powershell.join("\n")}
\`\`\`

Bash:

\`\`\`bash
${commands.foundry.bash.join("\n")}
\`\`\`
`);
  }
  if (commands.node) {
    sections.push(`## Deploy With Node.js

PowerShell:

\`\`\`powershell
${commands.node.powershell.join("\n")}
\`\`\`

Bash:

\`\`\`bash
${commands.node.bash.join("\n")}
\`\`\`

Compile-only check:

\`\`\`powershell
npm install --no-audit --no-fund
npm run compile-check
\`\`\`
`);
  }
  if (includeLiquidity && commands.liquidity) {
    if (!isFaroSwapLiquidityAvailable(network)) {
      sections.push(`## FaroSwap Liquidity

FaroSwap liquidity adding is currently unavailable on ${network.name}. The generated \`add-liquidity.mjs\` script exits with an explanation before requesting a private key or sending a transaction.

Reason: ${faroSwapLiquidityUnavailableReason(network)}

Use this project to deploy and test the ERC20 on ${network.name}. Add FaroSwap liquidity on Pharos mainnet only after explicit confirmation.
`);
    } else {
      sections.push(`## Add Liquidity On FaroSwap

The generated \`add-liquidity.mjs\` script creates a FaroSwap ${token.symbol}/${network.nativeToken} liquidity position. It reads \`deployment-result.json\` after token deployment or uses \`TOKEN_ADDRESS\` from the environment.

PowerShell:

\`\`\`powershell
${commands.liquidity.powershell.join("\n")}
\`\`\`

Review \`faroswap-liquidity-plan.md\` before signing.
`);
    }
  }

  sections.push(`## Managed Deploy From Skill Project

You can also deploy from the project where the skill is installed. The skill reads this folder's \`launch-config.json\` and runs the selected backend inside the generated launch folder.

PowerShell:

\`\`\`powershell
$env:PRIVATE_KEY="paste_private_key_here"
node .\\.agents\\skills\\pharos-erc20-launch-agent\\scripts\\launch-erc20.mjs --output-dir "<path_to_this_launch_folder>" --deploy --deploy-backend node --yes
\`\`\`

If the launch project was generated with \`--install-project-scripts\`, run from the project root instead:

\`\`\`powershell
$env:PRIVATE_KEY="paste_private_key_here"
npm run deploy
\`\`\`
`);

  sections.push(`## Verify

See \`verification-checklist.md\`.

## Safety

Do not commit real private keys. Review \`src/${token.contractName}.sol\` and generated deployment files before broadcasting.
`);
  return sections.join("\n");
}

function runDeploy(args, network) {
  if (!args.yes) throw new Error("--deploy requires --yes after explicit user confirmation");
  if (network.name === "mainnet" && !args.confirmMainnet) throw new Error("--deploy on mainnet requires --confirm-mainnet");
  if (!process.env.PRIVATE_KEY) throw new Error("--deploy requires PRIVATE_KEY in the local environment");
  if (!args.outputDir) throw new Error("--deploy requires --output-dir so the generated project location is explicit");
  return args.deployBackend === "node" ? runNodeDeploy(args, network) : runFoundryDeploy(args, network);
}

function runFoundryDeploy(args, network) {
  const forgeCheck = spawnSync("forge", ["--version"], { encoding: "utf8" });
  if (forgeCheck.error || forgeCheck.status !== 0) throw new Error("Foundry forge is not available in this shell");
  const result = spawnSync("forge", [
    "script",
    "script/DeployPharosLaunchToken.s.sol:DeployPharosLaunchToken",
    "--rpc-url",
    network.rpcUrl,
    "--private-key",
    process.env.PRIVATE_KEY,
    "--broadcast",
    "--skip-simulation"
  ], {
    cwd: path.resolve(args.outputDir),
    encoding: "utf8",
    env: process.env
  });
  return {
    status: result.status,
    stdout: redactSecret(result.stdout || "", process.env.PRIVATE_KEY),
    stderr: redactSecret(result.stderr || "", process.env.PRIVATE_KEY),
    error: result.error ? result.error.message : null,
    command: "forge script script/DeployPharosLaunchToken.s.sol:DeployPharosLaunchToken --rpc-url <rpc> --private-key <redacted> --broadcast --skip-simulation"
  };
}

function runNodeDeploy(args, network) {
  const outputDir = path.resolve(args.outputDir);
  if (!fs.existsSync(path.join(outputDir, "deploy.mjs"))) throw new Error("Node deployer was not generated. Use --backend node or --backend both.");
  const npmRunner = resolveNpmRunner();
  if (!npmRunner) throw new Error("npm is not available in this shell");
  const childEnv = { ...process.env, RPC_URL: network.rpcUrl };
  if (!fs.existsSync(path.join(outputDir, "node_modules"))) {
    const install = spawnSync(npmRunner.command, [...npmRunner.argsPrefix, "install", "--no-audit", "--no-fund"], {
      cwd: outputDir,
      encoding: "utf8",
      env: childEnv
    });
    if (install.error || install.status !== 0) {
      return {
        status: install.status ?? 1,
        stdout: install.stdout || "",
        stderr: install.stderr || "",
        error: install.error ? install.error.message : "npm install failed",
        command: npmRunner.displayInstall
      };
    }
  }
  const result = spawnSync(process.execPath, ["deploy.mjs"], { cwd: outputDir, encoding: "utf8", env: childEnv });
  return {
    status: result.status,
    stdout: redactSecret(result.stdout || "", process.env.PRIVATE_KEY),
    stderr: redactSecret(result.stderr || "", process.env.PRIVATE_KEY),
    error: result.error ? result.error.message : null,
    command: "node deploy.mjs"
  };
}

function resolveNpmRunner() {
  const candidates = [];
  if (process.env.npm_execpath) {
    const npmExecPath = process.env.npm_execpath;
    if (/\.(?:mjs|cjs|js)$/i.test(npmExecPath)) {
      candidates.push({
        command: process.execPath,
        argsPrefix: [npmExecPath],
        displayInstall: "node <npm-cli> install --no-audit --no-fund"
      });
    } else {
      candidates.push({
        command: npmExecPath,
        argsPrefix: [],
        displayInstall: "npm install --no-audit --no-fund"
      });
    }
  }
  candidates.push({
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    argsPrefix: [],
    displayInstall: "npm install --no-audit --no-fund"
  });

  for (const candidate of candidates) {
    const check = spawnSync(candidate.command, [...candidate.argsPrefix, "--version"], {
      encoding: "utf8",
      env: process.env
    });
    if (!check.error && check.status === 0) return candidate;
  }
  return null;
}

function redactSecret(text, secret) {
  return secret ? text.split(secret).join("<redacted>") : text;
}

function renderPlan(plan, args) {
  if (args.format === "json") return `${JSON.stringify(plan, null, 2)}\n`;
  if (args.format === "console") return renderConsole(plan, args);
  return renderMarkdown(plan);
}

function renderMarkdown(plan) {
  const lines = [];
  lines.push("# Pharos ERC20 Launch Plan", "");
  lines.push(`Generated: \`${plan.generatedAt}\``);
  lines.push(`Mode: \`${plan.mode}\``, "");
  lines.push("## Summary", "");
  lines.push(`- Token: **${plan.token.name}** (\`${plan.token.symbol}\`)`);
  lines.push(`- Network: \`${plan.network.name}\` (${plan.network.chainId}, ${plan.network.nativeToken})`);
  lines.push(`- Supply: \`${plan.token.supplyInput}\` tokens`);
  lines.push(`- Owner: \`${plan.addresses.owner || "deployer"}\``);
  lines.push(`- Deployer: \`${plan.addresses.deployer || "not provided"}\``);
  lines.push(`- Backends: \`${plan.backends.join(", ")}\``, "");
  lines.push("## Network", "");
  lines.push(`- RPC: \`${plan.network.rpcUrl}\``);
  lines.push(`- Explorer: ${plan.network.explorerUrl}`);
  lines.push(`- Native token: \`${plan.network.nativeToken}\``, "");
  lines.push("## Token Config", "");
  lines.push(`- Contract: \`${plan.token.contractName}\``);
  lines.push(`- Decimals: \`${plan.token.decimals}\``);
  lines.push(`- Human supply: \`${plan.token.supplyInput}\``);
  lines.push(`- Base-unit supply: \`${plan.token.initialSupplyBaseUnits}\``, "");
  if (plan.liquidity) {
    lines.push(`## ${liquidityDisplayName(plan.liquidity)} Liquidity`, "");
    lines.push(`- Pair: \`${plan.liquidity.pair}\``);
    if (plan.liquidity.available === false) {
      lines.push("- Status: `unavailable on this network`");
      lines.push(`- Reason: ${plan.liquidity.unavailableReason}`);
    }
    lines.push(`- Router: \`${plan.liquidity.router || "missing"}\``);
    if (plan.liquidity.routerKind) lines.push(`- Router kind: \`${plan.liquidity.routerKind}\``);
    if (plan.liquidity.feeRate !== undefined && plan.liquidity.routerKind === "faroswap-amm-v2") lines.push(`- Fee rate: \`${plan.liquidity.feeRate}\``);
    lines.push(`- Token amount: \`${plan.liquidity.tokenAmountInput || "missing"} ${plan.token.symbol}\``);
    lines.push(`- Native amount: \`${plan.liquidity.nativeAmountInput || "missing"} ${plan.network.nativeToken}\``);
    lines.push(`- LP recipient: \`${plan.liquidity.recipient || "deployer wallet"}\``);
    lines.push(`- Slippage: \`${plan.liquidity.slippageBps} bps\``, "");
  }
  lines.push("## Checks", "");
  for (const check of plan.checks) lines.push(`- ${statusBadge(check.status)} ${check.message}`);
  lines.push("", "## Estimates", "");
  lines.push(`- Gas price: \`${plan.estimates.gasPriceWei || "fallback 10000000000"} wei\``);
  lines.push(`- Deployment gas limit estimate: \`${plan.estimates.deployGasLimit || DEFAULT_DEPLOY_GAS.toString()}\``);
  lines.push(`- Estimated deployment cost: \`${plan.estimates.estimatedDeployCostNative || "pending"} ${plan.network.nativeToken}\``);
  if (plan.liquidity && plan.liquidity.available !== false) lines.push(`- Estimated liquidity gas cost: \`${plan.estimates.estimatedLiquidityGasCostNative || "pending"} ${plan.network.nativeToken}\``);
  if (plan.estimates.deployerBalanceWei) lines.push(`- Deployer balance: \`${formatUnits(BigInt(plan.estimates.deployerBalanceWei), 18, 6)} ${plan.network.nativeToken}\``);
  if (plan.generatedProjectDir) {
    lines.push("", "## Generated Project", "", "Directory: current launch project folder", "");
    for (const file of plan.generatedFiles) lines.push(`- \`${file}\``);
  }
  if (plan.projectScripts) {
    lines.push("", "## Project NPM Scripts", "");
    lines.push(`- Package file: \`${path.basename(plan.projectScripts.packageJson)}\``);
    lines.push(`- Launch folder: \`${plan.projectScripts.launchDir}\``);
    lines.push("- Plan from project root: `npm run pharos:erc20:plan`");
    lines.push(`- Deploy from project root: \`${plan.projectScripts.deployScriptInstalled ? "npm run deploy" : "npm run pharos:erc20:deploy"}\``);
    if (plan.projectScripts.scripts["pharos:erc20:liquidity"]) lines.push("- Add liquidity from project root: `npm run pharos:erc20:liquidity`");
  }
  if (plan.commands?.powershell?.length) {
    lines.push("", "## Deployment Commands", "");
    lines.push("### PowerShell", "", "```powershell", ...plan.commands.powershell, "```", "");
    lines.push("### Bash", "", "```bash", ...plan.commands.bash, "```");
  }
  lines.push("", "## Recommendations", "");
  for (const item of plan.recommendations) lines.push(`- ${item}`);
  if (plan.deployment) {
    lines.push("", "## Deployment Result", "", `Status code: ${plan.deployment.status}`);
    if (plan.deployment.error) lines.push(`Error: ${plan.deployment.error}`);
    if (plan.deployment.stdout) lines.push("", "```text", plan.deployment.stdout.trim(), "```");
    if (plan.deployment.stderr) lines.push("", "```text", plan.deployment.stderr.trim(), "```");
  }
  lines.push("", "_Launch planning is safe by default. Deployment requires explicit confirmation and a local PRIVATE_KEY environment variable._");
  return `${lines.join("\n")}\n`;
}

function renderConsole(plan, args) {
  const color = (status, text) => {
    if (args.noColor) return text;
    if (status === "OK") return `${COLORS.green}${text}${COLORS.reset}`;
    if (status === "WARN") return `${COLORS.yellow}${text}${COLORS.reset}`;
    if (status === "FAIL") return `${COLORS.red}${text}${COLORS.reset}`;
    return text;
  };
  const titleText = "PHAROS ERC20 LAUNCH PLAN";
  const title = args.noColor ? titleText : `${COLORS.bold}${COLORS.cyan}${titleText}${COLORS.reset}`;
  const width = 78;
  const lines = [boxLine("top", width), boxText(title, width), boxLine("mid", width)];
  lines.push(boxText(`Generated  ${plan.generatedAt}`, width));
  lines.push(boxText(`Mode       ${plan.mode}`, width));
  lines.push(boxLine("mid", width));
  lines.push(boxText(`Token      ${plan.token.name} (${plan.token.symbol})`, width));
  lines.push(boxText(`Supply     ${plan.token.supplyInput} tokens`, width));
  lines.push(boxText(`Base units ${compactMiddle(plan.token.initialSupplyBaseUnits, 42)}`, width));
  lines.push(boxText(`Network    ${plan.network.name} | chain ${plan.network.chainId} | ${plan.network.nativeToken}`, width));
  lines.push(boxText(`Owner      ${compactAddress(plan.addresses.owner || "deployer")}`, width));
  lines.push(boxText(`Deployer   ${compactAddress(plan.addresses.deployer || "not provided")}`, width));
  lines.push(boxText(`Backends   ${plan.backends.join(", ")}`, width));
  if (plan.liquidity) {
    lines.push(boxLine("mid", width));
    lines.push(boxText(`${liquidityDisplayName(plan.liquidity)} liquidity`, width));
    lines.push(boxText(`Pair       ${plan.liquidity.pair}`, width));
    if (plan.liquidity.available === false) {
      lines.push(boxText("Status     unavailable on this network", width));
      lines.push(boxText(`Reason     ${plan.liquidity.unavailableReason}`, width));
    }
    lines.push(boxText(`Router     ${compactAddress(plan.liquidity.router || "missing")}`, width));
    if (plan.liquidity.routerKind === "faroswap-amm-v2") lines.push(boxText(`Fee rate   ${plan.liquidity.feeRate}`, width));
    lines.push(boxText(`Token amt  ${plan.liquidity.tokenAmountInput || "missing"} ${plan.token.symbol}`, width));
    lines.push(boxText(`Native amt ${plan.liquidity.nativeAmountInput || "missing"} ${plan.network.nativeToken}`, width));
    lines.push(boxText(`Recipient  ${compactAddress(plan.liquidity.recipient || "deployer wallet")}`, width));
  }
  lines.push(boxLine("mid", width));
  lines.push(boxText("Checks", width));
  for (const check of plan.checks) lines.push(boxText(`${color(check.status, `[${check.status}]`)} ${check.message}`, width));
  lines.push(boxLine("mid", width));
  lines.push(boxText("Estimate", width));
  lines.push(boxText(`Gas price  ${plan.estimates.gasPriceWei || "fallback 10000000000"} wei`, width));
  lines.push(boxText(`Gas limit  ${plan.estimates.deployGasLimit || DEFAULT_DEPLOY_GAS.toString()}`, width));
  lines.push(boxText(`Cost       ${plan.estimates.estimatedDeployCostNative || "pending"} ${plan.network.nativeToken}`, width));
  if (plan.liquidity && plan.liquidity.available !== false) lines.push(boxText(`Liq gas    ${plan.estimates.estimatedLiquidityGasCostNative || "pending"} ${plan.network.nativeToken}`, width));
  if (plan.estimates.deployerBalanceWei) {
    lines.push(boxText(`Balance    ${formatUnits(BigInt(plan.estimates.deployerBalanceWei), 18, 6)} ${plan.network.nativeToken}`, width));
  }
  if (plan.generatedProjectDir) {
    lines.push(boxLine("mid", width));
    lines.push(boxText(`Generated  ${path.basename(plan.generatedProjectDir)}`, width));
    for (const file of plan.generatedFiles) lines.push(boxText(`- ${file}`, width));
  }
  if (plan.projectScripts) {
    lines.push(boxLine("mid", width));
    lines.push(boxText("Project npm scripts", width));
    lines.push(boxText("Plan       npm run pharos:erc20:plan", width));
    lines.push(boxText(`Deploy     ${plan.projectScripts.deployScriptInstalled ? "npm run deploy" : "npm run pharos:erc20:deploy"}`, width));
    if (plan.projectScripts.scripts["pharos:erc20:liquidity"]) lines.push(boxText("Liquidity  npm run pharos:erc20:liquidity", width));
  }
  lines.push(boxLine("mid", width));
  lines.push(boxText("Recommendations", width));
  for (const item of plan.recommendations) lines.push(boxText(`- ${item}`, width));
  lines.push(boxLine("bottom", width));
  lines.push("Launch planning is safe by default. Deployment requires explicit confirmation.");
  return `${lines.join("\n")}\n`;
}

function statusBadge(status) {
  if (status === "OK") return "`OK`";
  if (status === "WARN") return "`WARN`";
  if (status === "FAIL") return "`FAIL`";
  return `\`${status}\``;
}

function liquidityDisplayName(liquidity) {
  return "FaroSwap";
}

function boxLine(type, width) {
  const left = type === "top" ? "+" : type === "bottom" ? "+" : "+";
  const right = "+";
  return `${left}${"-".repeat(width - 2)}${right}`;
}

function boxText(text, width) {
  const clean = stripAnsi(String(text));
  const visibleLimit = width - 4;
  if (clean.length <= visibleLimit) {
    return `| ${text}${" ".repeat(visibleLimit - clean.length)} |`;
  }
  const rows = wrapVisible(text, visibleLimit);
  return rows.map((row) => `| ${row}${" ".repeat(visibleLimit - stripAnsi(row).length)} |`).join("\n");
}

function wrapVisible(text, limit) {
  const plain = stripAnsi(String(text));
  const words = plain.split(/\s+/);
  const rows = [];
  let current = "";
  for (const word of words) {
    if (!current) {
      current = word.length > limit ? `${word.slice(0, limit - 1)}~` : word;
    } else if (`${current} ${word}`.length <= limit) {
      current = `${current} ${word}`;
    } else {
      rows.push(current);
      current = word.length > limit ? `${word.slice(0, limit - 1)}~` : word;
    }
  }
  if (current) rows.push(current);
  return rows;
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, "");
}

function compactAddress(value) {
  if (!ADDRESS_RE.test(String(value))) return value;
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function compactMiddle(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) return text;
  const head = Math.floor((maxLength - 3) / 2);
  const tail = maxLength - 3 - head;
  return `${text.slice(0, head)}...${text.slice(-tail)}`;
}

function formatUnits(value, decimals, maxFraction = 6) {
  const scale = 10n ** BigInt(decimals);
  const whole = value / scale;
  const fraction = value % scale;
  if (fraction === 0n || maxFraction === 0) return whole.toString();
  const raw = fraction.toString().padStart(decimals, "0").slice(0, maxFraction);
  const trimmed = raw.replace(/0+$/, "");
  return trimmed ? `${whole.toString()}.${trimmed}` : whole.toString();
}

function escapeSolidityString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeJsString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

function escapeShell(value) {
  return String(value).replace(/"/g, '\\"');
}
