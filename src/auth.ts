import { fetch } from './platform'
import { base58btc } from 'multiformats/bases/base58'
import * as varint from 'varint'

const HeaderMintKey = "X-Metaplex-Mint-PubKey"
const HeaderSignature = "X-Metaplex-Mint-Signature"

const TagChain = "chain"
const TagSolanaCluster = "solana-cluster"
const SigningDomainPrefix = new TextEncoder().encode("metaplex-pl-dotstorage-auth:")

const MulticodecEd25519Pubkey = varint.encode(0xed)

// TODO: read from config / env var
const MetaplexAuthEndpoint = new URL("https://us-central1-metaplex-web3storage-dev.cloudfunctions.net/metaplex-auth-dev")

export type SolanaCluster = 'mainnet-beta' | 'devnet'

export interface AuthContext {
  chain: 'solana'

  solanaCluster: SolanaCluster

  signer: Signer

  pubkey: Uint8Array
}

export interface Signer {
  signMessage(message: Uint8Array): Promise<Uint8Array>
}

interface RequestContext {
  message: RequestMessage
  messageBytes: Uint8Array
  mintDID: string
  signature: Uint8Array
}

async function getUploadToken(auth: AuthContext, rootCID: string): Promise<string> {
  const requestContext = await makePutCarRequestContext(auth, rootCID)

  const res = await fetch(MetaplexAuthEndpoint, {
    method: 'POST',
    headers: requestHeaders(requestContext),
    body: requestBody(requestContext)
  })
  if (!res.ok) {
    throw new Error(`request error: [${res.status}]: ${res.statusText}`)
  }

  const body = await res.json() as object
  if ('token' in body && typeof body['token'] === 'string') {
    return body['token']
  }
  throw new Error('no token in response body')
}

async function makePutCarRequestContext(auth: AuthContext, rootCID: string): Promise<RequestContext> {
  const tags = {
    [TagChain]: auth.chain,
    [TagSolanaCluster]: auth.solanaCluster
  }
  const message = {
    put: {
      rootCID,
      tags,
    }
  }
  const messageBytes = new TextEncoder().encode(JSON.stringify(message))
  const toSign = new Uint8Array([...SigningDomainPrefix, ...messageBytes])

  const mintDID = keyDID(auth.pubkey)
  const signature = await auth.signer.signMessage(toSign)
  return { message, messageBytes, mintDID, signature }
}

function requestHeaders(context: RequestContext): Record<string, string> {
  const sigMultibase = base58btc.encode(context.signature)

  return {
    'Content-Type': 'application/json',
    [HeaderMintKey]: context.mintDID,
    [HeaderSignature]: sigMultibase,
  }
}

function requestBody(context: RequestContext): Blob {
  return new Blob([context.messageBytes])
}

function keyDID(pubkey: Uint8Array): string {
  const keyWithCodec = new Uint8Array([...MulticodecEd25519Pubkey, ...pubkey])
  const mb = base58btc.encode(keyWithCodec)
  return `did:key:${mb}`
}

// internal types

interface PutCarRequest {
  rootCID: string,
  tags: Record<string, string>,
}

interface RequestMessage {
  put?: PutCarRequest
}

