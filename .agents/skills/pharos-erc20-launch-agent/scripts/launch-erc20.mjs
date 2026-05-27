#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.resolve(__dirname, "..");
const NETWORKS_PATH = path.join(SKILL_ROOT, "assets", "networks.json");
const DEFAULT_DEPLOY_GAS = 1600000n;
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
    addCheck(plan, "OK", `Generated launch project at ${path.resolve(outputDir)}.`);
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
  --yes                     Required with --deploy
  --confirm-mainnet         Required with --deploy --network mainnet
  --no-color                Disable console colors

Examples:
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet
  node scripts/launch-erc20.mjs --name "Demo Pharos Token" --symbol DPT --supply 1000000 --owner 0xf337687dD73c1A13EFE39393a000f55a95B1ac54 --network atlantic-testnet --generate --backend both --output-dir demo-pharos-token-launch
`);
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
  const normalized = normalizeAmountString(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new Error("--supply must be a positive decimal number");
  const fraction = match[2] || "";
  if (fraction.length > decimals) {
    throw new Error(`Supply has ${fraction.length} decimal places but token decimals is ${decimals}`);
  }
  const scale = 10n ** BigInt(decimals);
  const total = BigInt(match[1]) * scale + (fraction ? BigInt(fraction.padEnd(decimals, "0")) : 0n);
  if (total <= 0n) throw new Error("--supply must be greater than zero");
  return total;
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
      nativeToken: network.nativeToken
    },
    token,
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

  if (args.deploy) {
    if (!args.yes) addCheck(plan, "FAIL", "Deployment mode requires --yes after explicit user confirmation.");
    if (network.name === "mainnet" && !args.confirmMainnet) addCheck(plan, "FAIL", "Mainnet deployment requires --confirm-mainnet.");
    if (!process.env.PRIVATE_KEY) addCheck(plan, "FAIL", "Deployment mode requires PRIVATE_KEY in the local environment.");
  }
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
    files.push(writeFile(root, "package.json", renderPackageJson(token)));
    files.push(writeFile(root, "deploy.mjs", renderNodeDeployer(network, token, ownerLiteral)));
  }

  files.push(writeFile(root, "README.md", renderGeneratedReadme(network, token, args.backends)));
  return { files, commands: buildCommands(network, args.backends) };
}

function writeFile(root, relativePath, content) {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  return relativePath;
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
*.log
`;
}

function buildLaunchConfig(args, network, token) {
  return {
    generatedAt: new Date().toISOString(),
    network,
    token,
    backends: args.backends,
    owner: args.owner || "deployer",
    deployer: args.deployer || null,
    deployment: {
      deployBackend: args.deployBackend,
      commands: buildCommands(network, args.backends)
    }
  };
}

function buildCommands(network, backends = ["foundry", "node"]) {
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
  return commands;
}

function renderPackageJson(token) {
  return `${JSON.stringify({
    name: npmPackageName(token),
    private: true,
    type: "module",
    scripts: {
      "compile-check": "node deploy.mjs --compile-only",
      deploy: "node deploy.mjs"
    },
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

function renderGeneratedReadme(network, token, backends = ["foundry", "node"]) {
  const commands = buildCommands(network, backends);
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
  return args.deployBackend === "node" ? runNodeDeploy(args) : runFoundryDeploy(args, network);
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

function runNodeDeploy(args) {
  const outputDir = path.resolve(args.outputDir);
  if (!fs.existsSync(path.join(outputDir, "deploy.mjs"))) throw new Error("Node deployer was not generated. Use --backend node or --backend both.");
  if (!fs.existsSync(path.join(outputDir, "node_modules"))) throw new Error("Node dependencies are not installed. Run npm install inside the generated launch project first.");
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const npmCheck = spawnSync(npmCommand, ["--version"], { encoding: "utf8" });
  if (npmCheck.error || npmCheck.status !== 0) throw new Error("npm is not available in this shell");
  const result = spawnSync(npmCommand, ["run", "deploy"], { cwd: outputDir, encoding: "utf8", env: process.env });
  return {
    status: result.status,
    stdout: redactSecret(result.stdout || "", process.env.PRIVATE_KEY),
    stderr: redactSecret(result.stderr || "", process.env.PRIVATE_KEY),
    error: result.error ? result.error.message : null,
    command: "npm run deploy"
  };
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
  lines.push(`Generated: ${plan.generatedAt}`);
  lines.push(`Mode: ${plan.mode}`, "");
  lines.push("## Network", "", "| Field | Value |", "| --- | --- |");
  lines.push(`| Network | ${plan.network.name} |`);
  lines.push(`| Chain ID | ${plan.network.chainId} |`);
  lines.push(`| Native token | ${plan.network.nativeToken} |`);
  lines.push(`| RPC | ${plan.network.rpcUrl} |`);
  lines.push(`| Explorer | ${plan.network.explorerUrl} |`, "");
  lines.push("## Token", "", "| Field | Value |", "| --- | --- |");
  lines.push(`| Name | ${plan.token.name} |`);
  lines.push(`| Symbol | ${plan.token.symbol} |`);
  lines.push(`| Decimals | ${plan.token.decimals} |`);
  lines.push(`| Human supply | ${plan.token.supplyInput} |`);
  lines.push(`| Base-unit supply | ${plan.token.initialSupplyBaseUnits} |`);
  lines.push(`| Contract | ${plan.token.contractName} |`);
  lines.push(`| Owner | ${plan.addresses.owner || "deployer"} |`);
  lines.push(`| Deployer | ${plan.addresses.deployer || "not provided"} |`);
  lines.push(`| Backends | ${plan.backends.join(", ")} |`, "");
  lines.push("## Checks", "", "| Status | Check |", "| --- | --- |");
  for (const check of plan.checks) lines.push(`| ${check.status} | ${check.message} |`);
  lines.push("", "## Estimates", "", "| Field | Value |", "| --- | --- |");
  lines.push(`| Gas price | ${plan.estimates.gasPriceWei || "fallback 10000000000"} wei |`);
  lines.push(`| Deployment gas limit estimate | ${plan.estimates.deployGasLimit || DEFAULT_DEPLOY_GAS.toString()} |`);
  lines.push(`| Estimated deployment cost | ${plan.estimates.estimatedDeployCostNative || "pending"} ${plan.network.nativeToken} |`);
  if (plan.estimates.deployerBalanceWei) lines.push(`| Deployer balance | ${formatUnits(BigInt(plan.estimates.deployerBalanceWei), 18, 6)} ${plan.network.nativeToken} |`);
  if (plan.generatedProjectDir) {
    lines.push("", "## Generated Project", "", `Directory: \`${plan.generatedProjectDir}\``, "");
    for (const file of plan.generatedFiles) lines.push(`- \`${file}\``);
  }
  if (plan.commands?.powershell?.length) {
    lines.push("", "## Deployment Commands", "", "PowerShell:", "", "```powershell", ...plan.commands.powershell, "```", "", "Bash:", "", "```bash", ...plan.commands.bash, "```");
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
  const title = args.noColor ? "PHAROS ERC20 LAUNCH PLAN" : `${COLORS.bold}${COLORS.cyan}PHAROS ERC20 LAUNCH PLAN${COLORS.reset}`;
  const lines = [title, `Generated: ${plan.generatedAt}`, `Mode: ${plan.mode}`, ""];
  lines.push(`Network: ${plan.network.name} (${plan.network.chainId}, ${plan.network.nativeToken})`);
  lines.push(`Token: ${plan.token.name} (${plan.token.symbol})`);
  lines.push(`Supply: ${plan.token.supplyInput} (${plan.token.initialSupplyBaseUnits} base units)`);
  lines.push(`Owner: ${plan.addresses.owner || "deployer"}`);
  lines.push(`Deployer: ${plan.addresses.deployer || "not provided"}`);
  lines.push(`Backends: ${plan.backends.join(", ")}`, "", "Checks:");
  for (const check of plan.checks) lines.push(`  ${color(check.status, `[${check.status}]`)} ${check.message}`);
  lines.push("", "Estimate:");
  lines.push(`  Gas price: ${plan.estimates.gasPriceWei || "fallback 10000000000"} wei`);
  lines.push(`  Deploy gas limit: ${plan.estimates.deployGasLimit || DEFAULT_DEPLOY_GAS.toString()}`);
  lines.push(`  Estimated cost: ${plan.estimates.estimatedDeployCostNative || "pending"} ${plan.network.nativeToken}`);
  if (plan.generatedProjectDir) {
    lines.push("", `Generated project: ${plan.generatedProjectDir}`);
    for (const file of plan.generatedFiles) lines.push(`  - ${file}`);
  }
  lines.push("", "Recommendations:");
  for (const item of plan.recommendations) lines.push(`  - ${item}`);
  lines.push("", "Launch planning is safe by default. Deployment requires explicit confirmation.");
  return `${lines.join("\n")}\n`;
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
