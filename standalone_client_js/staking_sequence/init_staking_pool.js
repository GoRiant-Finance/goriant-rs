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

  const mint = new anchor.web3.PublicKey(config.token);
  const god = new anchor.web3.PublicKey(config.vault);

  const secondInDay = 86_400; // second
  try {
    const stateRate = new anchor.BN(1);
    const withdrawTimeLock = new anchor.BN(0);
    // reward start after 5 minutes
    const startBlock = new anchor.BN(new Date().getTime() / 1000 + (5 * 60));
    // reward end after begin 30 day
    const endBlock = new anchor.BN(new Date().getTime() / 1000 + (secondInDay * 30));
    const rewardPerBlock = new anchor.BN(0.1 * tokenInLamport);
    let statePubKey = await program.state.address();
    const rewardVault = new anchor.web3.Keypair();

    const [stakingPoolImprint, stateImprintNonce] = await anchor.web3.PublicKey.findProgramAddress(
      [statePubKey.toBuffer()],
      program.programId
    );

    /// pool mint with state authority
    const poolMint = await serumCmn.createMint(provider, stakingPoolImprint, 9);

    let tx = await program.state.rpc.new(
      mint,
      statePubKey,
      stateImprintNonce,
      stateRate,
      withdrawTimeLock,
      startBlock,
      rewardPerBlock,
      endBlock,
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
            stakingPoolImprint
          ))
        ]
      }
    );
    console.log("tx id: ", tx);
    console.log("poolMint.authority: ", stakingPoolImprint.toString());
  } catch (e) {
    console.log("Pool has been initialized: ", e);
  }


  let state = await program.state();
  await utils.log_state(state);
}

main().then(() => console.log('Success'));