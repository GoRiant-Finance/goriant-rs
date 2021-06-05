const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCmn = require("@project-serum/common");
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;
const program_id = new anchor.web3.PublicKey(config.programId);
anchor.setProvider(provider);
const idl = utils.readIdl();
let program = new anchor.Program(idl, program_id);
const tokenInLamport = anchor.web3.LAMPORTS_PER_SOL;

async function main() {
  const [mint, god] = await serumCmn.createMintAndVault(
    provider,
    new anchor.BN(1_000_000 * anchor.web3.LAMPORTS_PER_SOL),
    provider.wallet.publicKey,
    9
  );

  config.token = mint.toBase58();
  config.vault = god.toBase58();
  utils.writeConfig(config);
  //
  // const mint = new anchor.web3.PublicKey(config.token);
  // const god = new anchor.web3.PublicKey(config.vault);

  const minuteInSecond = 60;
  try {
    const stateRate = new anchor.BN(1);
    const withdrawTimeLock = new anchor.BN(0);
    // reward start immediately
    const start_block = new anchor.BN(new Date().getTime() / 1000);// + 0.5 * minuteInSecond);
    // reward end after begin 30 day
    const end_block = new anchor.BN(new Date().getTime() / 1000 + (minuteInSecond * 60) );
    const reward_per_block = new anchor.BN(1 * tokenInLamport);
    let state_pubKey = await program.state.address();
    const rewardVault = new anchor.web3.Keypair();

    const [staking_pool_imprint, state_imprint_nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [state_pubKey.toBuffer()],
      program.programId
    );

    /// pool mint with state authority
    const poolMint = await serumCmn.createMint(provider, staking_pool_imprint, 9);

    let tx = await program.state.rpc.new(
      mint,
      state_pubKey,
      state_imprint_nonce,
      stateRate,
      withdrawTimeLock,
      start_block,
      reward_per_block,
      end_block,
      {
        accounts: {
          authority: provider.wallet.publicKey,
          poolMint,
          rewardVault: rewardVault.publicKey,
          rewardDeposit: god,
          rewardAuthority: provider.wallet.publicKey,
          tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY
        },
        signers: [rewardVault],
        instructions: [
          ...(await serumCmn.createTokenAccountInstrs(
            provider,
            rewardVault.publicKey,
            mint,
            staking_pool_imprint
          ))
        ]
      }
    );
    console.log("tx id: ", tx);
    console.log("poolMint.authority: ", staking_pool_imprint.toString());
  } catch (e) {
    console.log("Pool has been initialized: ", e);
  }


  let state = await program.state();
  await utils.log_state(state);
}

main().then(() => console.log('Success'));