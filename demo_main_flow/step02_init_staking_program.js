const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const utils = require("./utils");
const fs = require('fs');
//----------------
const provider = anchor.Provider.local('https://api.devnet.solana.com');
anchor.setProvider(provider);

const owner = provider.wallet.publicKey;

const main_staking_idl = JSON.parse(fs.readFileSync('../target/idl/main_staking.json', 'utf8'));

let main_staking_program_id;
let main_staking_program;

//--------

let mint;
let god;

const registrar = new anchor.web3.Account();
const rewardQ = new anchor.web3.Account();
const member = new anchor.web3.Account();

const pendingWithdrawal = new anchor.web3.Account();
const unlockedVendor = new anchor.web3.Account();
const unlockedVendorVault = new anchor.web3.Account();

const withdrawalTimelock = new anchor.BN(4);
const stakeRate = new anchor.BN(2);
const rewardQLen = 170;
let registrarAccount = null;
let registrarSigner = null;
let nonce = null;
let poolMint = null;


let memberAccount = null;
let memberSigner = null;
let balances = null;
let balancesLocked = null;

let unlockedVendorSigner = null;

async function main() {
  console.log("----------------------------------------");
  console.log("Start Setup")
  await load_context();
  await log_state();

  // bước này làm gì em ? :D
  await create_registry_genesis();
  await log_state();

  // Tạo pool stake chung
  await initialize_registrar();
  await log_state();

  await writeConfig();
  console.log("----------------------------------------");
}

async function writeConfig() {
  const config = await utils.readConfig();

  config.token = mint.toBase58();
  config.vault = god.toBase58();

  config.poolMint = poolMint.toString();

  config.registrar = registrar.publicKey.toBase58();
  config.registrarSigner = registrarSigner.toString();
  config.registrar_authority = registrarAccount.authority.toBase58();
  config.registrar_rewardEventQ = registrarAccount.rewardEventQ.toBase58();
  config.registrar_mint = registrarAccount.mint.toBase58();

  console.log("Write config: ", config);
  await utils.writeConfig(config);
}

async function load_context() {
  const config = await utils.readConfig();

  main_staking_program_id = new anchor.web3.PublicKey(config.programId);
  main_staking_program = new anchor.Program(main_staking_idl, main_staking_program_id);

  mint = new anchor.web3.PublicKey(config.token);
  god = new anchor.web3.PublicKey(config.vault);
}

async function create_registry_genesis() {
  console.log("----------------------------------------");
  console.log("create_registry_genesis");
  const [
    _registrarSigner,
    _nonce,
  ] = await anchor.web3.PublicKey.findProgramAddress(
    [registrar.publicKey.toBuffer()],
    main_staking_program.programId
  );
  registrarSigner = _registrarSigner;
  nonce = _nonce;

  poolMint = await serumCmn.createMint(provider, registrarSigner);

  console.log(" poolMint: ", poolMint.toBase58(), " ", await utils.balance(poolMint));
  console.log(" registrarSigner: ", registrarSigner.toBase58(), " ", await utils.balance(registrarSigner));
  console.log(" nonce: ", nonce);
  console.log("----------------------------------------");
}

async function initialize_registrar() {
  console.log("----------------------------------------");
  console.log("initialize_registrar")
  await main_staking_program.rpc.initialize(
    mint,
    owner,
    nonce,
    withdrawalTimelock,
    stakeRate,
    rewardQLen,
    {
      accounts: {
        registrar: registrar.publicKey,
        poolMint,
        rewardEventQ: rewardQ.publicKey,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      },
      signers: [registrar, rewardQ],
      instructions: [
        await main_staking_program.account.registrar.createInstruction(registrar),
        await main_staking_program.account.rewardQueue.createInstruction(rewardQ, 8250),
      ],
    });


  registrarAccount = await main_staking_program.account.registrar(registrar.publicKey);

  console.log("----------------------------------------");
}

async function log_state() {
  console.log("#########################")
  console.log("Start Log State")
  console.log("")
  if (main_staking_program_id) console.log("main_staking_program_id: ", main_staking_program_id.toBase58(), " ", await utils.balance(main_staking_program_id));
  if (owner) console.log("owner: ", owner.toBase58(), " ", await utils.balance(owner));
  else console.log("owner: ", owner);
  if (mint) console.log("mint: ", mint.toBase58(), " ", await utils.balance(mint));
  else console.log("mint: ", mint);
  if (god) console.log("god: ", god.toBase58(), " ", await utils.balance(god));
  else console.log("god: ", god);

  console.log("registrar: ", registrar.publicKey.toBase58());
  console.log("rewardQ: ", rewardQ.publicKey.toBase58());
  console.log("member: ", member.publicKey.toBase58());
  console.log("pendingWithdrawal: ", pendingWithdrawal.publicKey.toBase58());
  console.log("unlockedVendor: ", unlockedVendor.publicKey.toBase58());
  console.log("unlockedVendorVault: ", unlockedVendorVault.publicKey.toBase58());

  console.log("registrar.publicKey: ", registrar.publicKey.toString(), " ", await utils.balance(registrar.publicKey));
  if (registrarAccount) await utils.printRegistrarSigner(registrarAccount);

  if (registrarSigner) console.log("registrarSigner: ", registrarSigner.toBase58(), " ", await utils.balance(registrarSigner));
  else console.log("registrarSigner: ", registrarSigner);
  console.log("nonce: ", nonce);
  if (poolMint) console.log("poolMint: ", poolMint.toBase58(), " ", await utils.balance(poolMint));
  else console.log("poolMint: ", poolMint);
  console.log("memberAccount: ", memberAccount);
  console.log("memberSigner: ", memberSigner);
  if (balances) await utils.printBalance("balances", balances);
  if (balancesLocked) await utils.printBalance("balancesLocked", balancesLocked);
  console.log("unlockedVendorSigner: ", unlockedVendorSigner);

  console.log("")
  console.log("End Log State")
  console.log("#########################")
}

console.log('Running client.');
main().then(() => console.log('Success'));