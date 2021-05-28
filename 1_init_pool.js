const anchor = require("@project-serum/anchor");
const serumCmn = require("@project-serum/common");
const fs = require('fs');
const utils = require("./utils");
const config = utils.readConfig();
const provider = utils.provider;

const program_id = new anchor.web3.PublicKey(config.programId);
anchor.setProvider(provider);
const idl = JSON.parse(fs.readFileSync('./target/idl/staking.json', 'utf8'));
let program = new anchor.Program(idl, program_id);

async function main() {
  const mint = new anchor.web3.PublicKey(config.token);

  try {
    const rewardQ = new anchor.web3.Account();
    const stateRate = new anchor.BN(10);
    const withdrawTimeLock = new anchor.BN(10);
    let state_pubKey = await program.state.address();
    const [staking_pool_imprint, state_imprint_nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [state_pubKey.toBuffer()],
      program.programId
    );

    const vendor = new anchor.web3.Account();
    const vendorVault = new anchor.web3.Account();
    const [vendor_imprint, vendor_imprint_nonce] = await anchor.web3.PublicKey.findProgramAddress(
      [state_pubKey.toBuffer(), vendor.publicKey.toBuffer()],
      program.programId
    );

    /// pool mint with state authority
    const poolMint = await serumCmn.createMint(provider, staking_pool_imprint);

    let tx = await program.state.rpc.new(
      mint,
      state_pubKey,
      vendor.publicKey,
      state_imprint_nonce,
      vendor_imprint_nonce,
      stateRate,
      withdrawTimeLock,
      {
        accounts: {
          authority: provider.wallet.publicKey,
          vendor: vendor.publicKey,
          vendorVault: vendorVault.publicKey,
          rewardEventQ: rewardQ.publicKey,
          poolMint,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY
        },
        signers: [rewardQ, vendorVault, vendor],
        instructions: [
          await program.account.rewardQueue.createInstruction(rewardQ, 8250),
          ...(await serumCmn.createTokenAccountInstrs(
            provider,
            vendorVault.publicKey,
            mint,
            vendor_imprint
          )),
          await program.account.rewardVendor.createInstruction(vendor),
        ]
      }
    );
    console.log("tx id: ", tx);
    console.log("poolMint.authority: ", staking_pool_imprint.toString());
    console.log("vendorVault.authority: ", vendor_imprint.toString())
  } catch (e) {
    console.log("Pool has been initialized");
  }


  let state = await program.state();
  console.log("state.key: ", state.key.toString());
  console.log("state.authority: ", state.authority.toString());
  console.log("state.imprint: ", state.imprint.toString());
  console.log("state.nonce: ", state.nonce.toString())
  console.log("state.withdrawTimeLock: ", state.withdrawTimeLock.toString())
  console.log("state.rewardEventQ: ", state.rewardEventQ.toString())
  console.log("state.mint: ", state.mint.toString())
  console.log("state.poolMint: ", state.poolMint.toString())
  console.log("state.stakeRate: ", state.stakeRate.toString())
}

main().then(() => console.log('Success'));