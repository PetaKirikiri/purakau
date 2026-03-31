/**
 * Demo: Koru construction system.
 * Run: npx tsx scripts/koru-construction-demo.ts
 */

import {
  koruSpiralRecipe,
  koruHookRecipe,
  koruTerminationRecipe,
  constructionToSvg,
} from '../src/lib/koruConstruction/recipes'
import {
  constructionToJson,
  constructionFromJson,
  constructionToFullOutput,
} from '../src/lib/koruConstruction/json'
import { executeConstruction } from '../src/lib/koruConstruction/builder'

console.log('=== Koru Spiral (JSON first, then SVG) ===\n')
const spiral = koruSpiralRecipe()
const json = constructionToJson(spiral)
console.log('Construction JSON:')
console.log(json)
console.log('\nParsed and executed:')
const parsed = constructionFromJson(json)
const { pathD, metadata } = executeConstruction(parsed)
console.log('pathD:', pathD)
console.log('placed:', metadata.placed.length)
console.log('segments:', metadata.segments.length)
console.log('\nSVG:')
console.log(constructionToSvg(spiral))

console.log('\n\n=== Koru Hook ===\n')
const hook = koruHookRecipe()
console.log(constructionToFullOutput(hook))

console.log('\n\n=== Koru Termination ===\n')
const term = koruTerminationRecipe()
console.log(constructionToSvg(term))
