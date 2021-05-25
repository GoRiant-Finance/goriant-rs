const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const fs = require('fs');
const utils = require("./utils");
const config = utils.readConfig();
const program_id = new anchor.web3.PublicKey(config.programId);

// const provider = anchor.Provider.local('https://devnet.solana.com');
const provider = anchor.Provider.local();
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync('./target/idl/staking.json', 'utf8'));

let program = new anchor.Program(idl, program_id);


async function main() {
    const god = new anchor.web3.PublicKey(config.vault);
    let state_pubKey = await program.state.address();
    let state = await program.state();
    let member = await program.account.member.associatedAddress(provider.wallet.publicKey);
    let memberAccount = await program.account.member.associated(provider.wallet.publicKey);
    console.log("member: ", member.toString())
    let balances = memberAccount.balances;
    const [
        memberImprint,
        member_nonce,
    ] = await anchor.web3.PublicKey.findProgramAddress(
        [state_pubKey.toBuffer(), member.toBuffer()],
        program.programId
    );

    let deposit_amount = new anchor.BN(100);
    try {
        let tx = await program.rpc.depositAndState(
            deposit_amount,
            {
                accounts: {
                    stakingPool: state_pubKey,
                    rewardEventQ: state.rewardEventQ,
                    poolMint: state.poolMint,
                    imprint: state.imprint,
                    member: member,
                    authority: provider.wallet.publicKey,
                    balances: balances,
                    memberImprint: memberImprint,
                    depositor: god,
                    depositorAuthority: provider.wallet.publicKey,
                    tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
                    clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY
                }
            }
        );
        console.log("tx: ", tx);

        console.log("memberAccount.authority: ", memberAccount.authority.toString())
        console.log("memberAccount.metadata: ", memberAccount.metadata.toString())
        console.log("memberAccount.rewardsCursor: ", memberAccount.rewardsCursor.toString())
        console.log("memberAccount.lastStakeTs: ", memberAccount.lastStakeTs.toString())
        console.log("memberAccount.nonce: ", memberAccount.nonce.toString());

        let memberBalances = memberAccount.balances;

        console.log("memberAccount.balances");
        console.log("spt: ", memberBalances.spt.toString(), " - amount: ", await utils.tokenBalance(memberBalances.spt))
        console.log("vaultStake: ", memberBalances.vaultStake.toString(), " - amount: ", await utils.tokenBalance(memberBalances.vaultStake))
        console.log("vaultPw: ", memberBalances.vaultPw.toString(), " - amount: ", await utils.tokenBalance(memberBalances.vaultPw))
    } catch (e) {
        console.log("Stake Error: ", e);
    }
}

main().then(() => console.log('Success'));