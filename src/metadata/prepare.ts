import { NFTStorage, CarReader } from "nft.storage"
import type { CID } from 'multiformats'

import { MetaplexMetadata, FileDescription, ensureValidMetadata } from './schema'

const GATEWAY_HOST = 'https://dweb.link'
type EncodedCar = { car: CarReader, cid: CID }

export interface PackagedNFT {
  metadata: MetaplexMetadata,  
  metadataCar: EncodedCar,
  assetCar: EncodedCar,
}

export async function prepareMetaplexNFT(metadata: Record<string, any>, imageFile: File, ...additionalAssetFiles: File[]): Promise<PackagedNFT> {
  const validated = ensureValidMetadata(metadata)

  const assetFiles = [imageFile, ...additionalAssetFiles]
  const encodedAssets = await NFTStorage.encodeDirectory(assetFiles)
  const filenames = additionalAssetFiles.map(f => f.name)

  const linkedMetadata = replaceFileRefsWithIPFSLinks(validated, imageFile.name, filenames, encodedAssets.cid.toString())
  const metadataFile = new File([JSON.stringify(linkedMetadata)], 'metadata.json')
  const encodedMetadata = await NFTStorage.encodeDirectory([metadataFile])

  return {
    metadata: linkedMetadata,
    metadataCar: encodedMetadata,
    assetCar: encodedAssets,
  }
}

function replaceFileRefsWithIPFSLinks(metadata: MetaplexMetadata, imageFilename: string, additionalFilenames: string[], assetRootCID: string): MetaplexMetadata {
  const imageGatewayURL = makeGatewayURL(assetRootCID, imageFilename)

  // For each entry in properties.files, we check to see if the `uri` field matches the filename
  // of any uploaded files. If so, we add two entries to the output `properties.files` array -
  // one with a gateway URL with `cdn = true`, and one `ipfs://` uri with `cdn = false`.
  // If the uri does not match the filename of any uploaded files, it is included as is.
  const files: FileDescription[] = metadata.properties.files.flatMap(f => {
    if (f.uri === imageFilename || additionalFilenames.includes(f.uri)) {
      return [
        {
          ...f,
          uri: makeGatewayURL(assetRootCID, f.uri),
          cdn: true,
        },
        {
          ...f,
          uri: makeIPFSUri(assetRootCID, f.uri),
          cdn: false,
        }
      ]
    }
    return [f]
  })

  // If animation_url matches a filename, replace with gateway url
  let animation_url = metadata.animation_url
  if (animation_url && additionalFilenames.includes(animation_url)) {
    animation_url = makeGatewayURL(assetRootCID, animation_url)
  }

  return {
    ...metadata,
    image: imageGatewayURL,
    animation_url,
    properties: {
      ...metadata.properties,
      files,
    }
  }
}


function makeGatewayURL(cid: string, path: string): string {
  const base = new URL(`/ipfs/${cid}`, GATEWAY_HOST)
  const u = new URL(path, base)
  return u.toString()
}

function makeIPFSUri(cid: string, path: string): string {
  const u = new URL(path, `ipfs://${cid}`)
  return u.toString()
}
