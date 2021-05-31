const expect = require("expect");
const anchor = require("@project-serum/anchor");
const TokenInstructions = require("@project-serum/serum").TokenInstructions;
const serumCmn = require("@project-serum/common");

describe("test ico program", () => {
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.Ico;
  const owner = provider.wallet.publicKey;

  describe("init Riant ICO pool", () => {

    it("test init Riant ICO program", async () => {

      // given
      const [mint, god] = await serumCmn.createMintAndVault(
        provider,
        new anchor.BN(1_000_000 * anchor.web3.LAMPORTS_PER_SOL),
        owner, 9);

      const statePubKey = await program.state.address();
      const start = new anchor.BN(new Date().getTime() / 1000);// + 0.5 * minuteInSecond);
      const cap = 10000; // raising 10,000 SOL
      const rate = 20; // 1 SOL = 20 RIANT
      const depositor = god;

      const icoPool = new anchor.web3.Keypair();
      const [icoPoolImprint, nonce] = await anchor.web3.PublicKey.findProgramAddress(
        [statePubKey.toBuffer()],
        program.programId
      );

      // when
      let tx = await program.state.rpc.new(
        statePubKey,
        start,
        cap,
        rate,
        {
          accounts: {
            authority: owner,
            depositor,
            icoPool: icoPool.publicKey,
            tokenProgram: TokenInstructions.TOKEN_PROGRAM_ID,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY
          },
          signers: [icoPool],
          instructions:
            [
              ...(await serumCmn.createTokenAccountInstrs(
                provider,
                icoPool.publicKey,
                mint,
                icoPoolImprint
              ))
            ]
        }
      );

      // then

      let state = await program.state();

      expect(tx).not.toBeNull();
      expect(state.key).not.toBeNull();
      expect(state.initialized).toBeTruthy();
      expect(state.start).toEqual(start);
      expect(state.cap).toEqual(cap);
      expect(state.raisedAmount).toEqual(0);
      expect(state.rate).toEqual(rate);
      expect(state.owner).toEqual(owner);
      expect(state.beneficiary).toEqual(owner);
      expect(state.icoPool).not.toBeNull();
    });
  })


});

