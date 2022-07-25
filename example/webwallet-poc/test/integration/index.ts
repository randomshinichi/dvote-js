import { Wallet } from "@ethersproject/wallet"
import { DVoteGateway } from "@vocdoni/client"
import { uintArrayToHex } from "@vocdoni/common"
import { FaucetPayload } from "@vocdoni/data-models/dist/protobuf/build/ts/vochain/vochain"
import { expect } from "chai"
import "mocha"
import { Account, generateFaucetPackage, generateFaucetPayload, retryUntilSuccess } from "../../src/index"

import { retry } from "ts-retry-promise"

const blockPeriod = 3000

describe("Network Tests Basic (requires http://localhost:9095/dvote and treasurer privkey)", function () {
    let dvoteGw: DVoteGateway
    this.timeout(0)
    before(async function () {
        if (!process.env["VOCHAIN_URL"] || !process.env["VOCHAIN_TREASURER_PRIVKEY"]) return this.skip();
        dvoteGw = new DVoteGateway({ uri: process.env["VOCHAIN_URL"] })
        await dvoteGw.init()
    })
    it('SetAccountInfoTx should be accepted by the node', async function () {
        const acc = new Account(Wallet.createRandom())
        await acc.setGw(dvoteGw)

        await acc.setInfo("ipfs://randomfile")

        const result = await retryUntilSuccess(async () => {
            return acc.getInfo()
        }, 5, blockPeriod)

        expect(result.infoURI).to.equal("ipfs://randomfile")

    })
    it('MintTokensTx should be accepted by the node', async function () {
        if (!process.env["VOCHAIN_URL"] || !process.env["VOCHAIN_TREASURER_PRIVKEY"]) return this.skip();
        const treasurer = new Account(new Wallet(process.env["VOCHAIN_TREASURER_PRIVKEY"]), true)
        await treasurer.setGw(dvoteGw)

        const a = new Account(Wallet.createRandom())
        await a.setGw(dvoteGw)

        a.setInfo("fdsa")
        const result = await retry(() => a.getInfo(), { retries: 3, delay: blockPeriod })

        await treasurer.mint(a.address(), 100)
        const r2 = await retryUntilSuccess(async () => {
            const r = await a.getInfo()
            expect(r.balance).to.equal(100)
        }, 3, blockPeriod)
    })
})

describe("signature tests (JS sigs are slightly different from Golang)", function () {
    it('serialized FaucetPayload should be the same as golang', async function () {
        const p = generateFaucetPayload("0xf7FB77ee1F309D9468fB6DCB71aDD0f934a33c6B", 10, 1)
        const pSerialized = uintArrayToHex(FaucetPayload.encode(p).finish())
        expect(pSerialized).to.equal("08011214f7fb77ee1f309d9468fb6dcb71add0f934a33c6b180a")
    })
    it.skip('serialized FaucetPayload should have the same signature as golang', async function () {
        const from = new Wallet("91f86dd7a9ac258c4908ca8fbdd3157f84d1f74ffffcb9fa428fba14a1d40150")

        const fPkg = await generateFaucetPackage(from, "0xf7FB77ee1F309D9468fB6DCB71aDD0f934a33c6B", 10, 1)
        const signatureFromGo = "f0584eb5aa4125a7ffd770d0112eefaca641fbe2367d0034651cfb3b800126403752a1e725b1a6d9237d2babee9c3a1b8e767f2f9d519ef848d68ddbbc59010201"
        expect(uintArrayToHex(fPkg.signature)).to.equal(signatureFromGo)
        // console.log(uintArrayToHex(fPkg.signature))
    })
})

describe("Network Tests (requires http://localhost:9095/dvote and treasurer privkey)", function () {
    this.timeout(0)
    let a: Account
    let b: Account
    let treasurer: Account
    let dvoteGw: DVoteGateway
    before(async function () {
        if (!process.env["VOCHAIN_URL"] || !process.env["VOCHAIN_TREASURER_PRIVKEY"]) return this.skip();
        dvoteGw = new DVoteGateway({ uri: process.env["VOCHAIN_URL"] })
        await dvoteGw.init()
    })
    beforeEach(async function () {
        if (!process.env["VOCHAIN_URL"] || !process.env["VOCHAIN_TREASURER_PRIVKEY"]) throw new Error("VOCHAIN_URL/VOCHAIN_TREASURER_PRIVKEY required");

        treasurer = new Account(new Wallet(process.env["VOCHAIN_TREASURER_PRIVKEY"]), true)
        a = new Account(Wallet.createRandom())
        b = new Account(Wallet.createRandom())
        await treasurer.setGw(dvoteGw)
        await a.setGw(dvoteGw)
        await b.setGw(dvoteGw)

        // console.log("creating account a", a.address())
        a.setInfo("a-account")
        // console.log("a.getInfo():")
        await retryUntilSuccess(async () => {
            return await a.getInfo()
        }, 5, blockPeriod)

        // console.log("creating account b", b.address())
        b.setInfo("b-account")
        // console.log("b.getInfo()")
        retryUntilSuccess(async () => {
            return await b.getInfo()
        }, 5, blockPeriod)

        // console.log("treasurer minting to a")
        treasurer.mint(a.address(), 999)
        await retryUntilSuccess(async () => {
            const r = await a.getInfo()
            expect(r.balance).to.equal(999)
        }, 5, blockPeriod)
    })
    it('genFaucet/claimFaucet', async function () {
        // console.log(a.address(), "sending to", b.address())
        const faucetPayload = await a.genFaucet(b.address(), 10)

        await b.claimFaucet(faucetPayload)

        await retryUntilSuccess(async () => {
            const r = await b.getInfo()
            expect(r.balance).to.equal(10)
        }, 5, blockPeriod)
    })
    it.skip('addDelegate/delDelegate (not yet implemented)', async function () {
        await a.addDelegate(b.address())
        await retryUntilSuccess(async () => {
            const r = await a.getInfo()
            console.log(r)
            expect(r.balance).to.equal(999)
        }, 5, blockPeriod)
    })
})