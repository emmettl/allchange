import {readFile,writeFile,readdir} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {joinWttColumns,supplementPublicCalls} from '@motionstudies/data/rail-journeys'
import {routeRailJourneys} from '@motionstudies/data/rail-routing'
import {publicTimetablePages,publicTimetableColumns} from '@motionstudies/data/rail-public-calls'
const policy=JSON.parse(await readFile(new URL('./london-rail-policy.json',import.meta.url)))
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
export const normalizeName=name=>name.toUpperCase().replaceAll('LONDON ','').replaceAll(' RAILWAY STATION','').replaceAll(' & ',' AND ').replace(/[^A-Z0-9]/g,'')
export function stationLookup(osm){
 const stations={},names={}
 for(const node of osm.elements){
  const tags=node.tags??{}
  if(node.type!=='node'||!('ref:crs' in tags)&&tags['ref:tiploc']!=='EBSFWJN')continue
  const code=tags['ref:crs']??tags['ref:tiploc'];stations[code]=node
  for(const key of ['name','alt_name','official_name','name:en'])for(const name of (tags[key]??'').split(';'))if(name)(names[normalizeName(name)]??=[]).push(code)
 }
 const lookup=Object.fromEntries(Object.entries(names).map(([name,codes])=>[name,codes.sort((a,b)=>Number(!(stations[a].tags.network??'').includes('National Rail'))-Number(!(stations[b].tags.network??'').includes('National Rail'))||(a<b?-1:a>b?1:0))[0]]))
 return {stations,lookup}
}
export function londonJoinOptions(osm){
 const {stations,lookup}=stationLookup(osm)
 return {serviceDate:'2026-09-04',stations,operators:Object.keys(policy.OPERATORS),normalizeName,resolveLocation:(name,operator,{header=false}={})=>{
  let code=policy.ALIASES[name]??lookup[normalizeName(name)]
  if(name==='ST PANCRAS INTERNATIONAL')code=operator==='TL'?'SPL':'STP'
  if(!header&&code&&stations[code]?.tags.network==='London Underground'&&code!=='ZPU')code=undefined
  return code
 }}
}
export const londonRoutingOptions={project:p=>[p[0]*69.3,p[1]*111.32],measure:(a,b)=>Math.hypot((a[0]-b[0])*69.3,(a[1]-b[1])*111.32),anchorRadius:code=>['STP','SPL','PAD','WAT','VIC'].includes(code)?.45:.25,includeWay:(way,nodes)=>way.tags?.railway==='rail'||way.tags?.railway==='subway'&&nodes.every(n=>n&&(n.lat>51.57&&n.lon<-.29||n.lat>51.416&&n.lat<51.463&&n.lon>-.217&&n.lon<-.19))}
export const publicTargets={'014':['LEB','Lea Bridge','LE'],'051':['BCZ','Brent Cross West','TL'],'161':['BRS','Berrylands','SW'],...Object.fromEntries(['180','181','182','183','184','185','186','189','190','191'].map(table=>[table,['WAE','London Waterloo (East)','SE']]))}
export async function londonPublicColumns(cache){
 const records=[]
 for(const [table,[target,label,operator]] of ['014','051','161','180','181','182','183','184','185','186','189','190','191'].map(table=>[table,publicTargets[table]])){
  if(target==='BRS'){
   if(!(await readFile(`${cache}/NRT161.txt`,'utf8')).includes('BERRYLANDS STATION IS CLOSED UNTIL 20 SEPTEMBER'))throw new Error('Review Berrylands closure against the passenger timetable')
   continue
  }
  const pages=publicTimetablePages(await readFile(`${cache}/NRT${table}.html`))
  records.push(...publicTimetableColumns(pages,{table:`NRT${table}`,target,operator,acceptPage:page=>page.text.includes('Mondays to Fridays')&&!page.text.includes('from 21 September'),resolveCode:name=>{
   let code=/\(([A-Z]{3})\)/.exec(name)?.[1]
   if(name.includes(label))code=target
   if(name.includes('London Charing Cross'))code='CHX'
   if(name.includes('St Pancras International')&&operator==='TL')code='SPL'
   return code
  }}))
 }
 return records
}
export async function compileLondonRail(cache){
 const osm=JSON.parse(await readFile(`${cache}/osm/combined.json`)),tables=[]
 for(const file of (await readdir(`${cache}/wtt`)).filter(f=>f.endsWith('.json')).sort()){
  const table=file.slice(0,-5);tables.push({table,sha256:hash(await readFile(`${cache}/wtt/${table}.xlsx`)),sheets:JSON.parse(await readFile(`${cache}/wtt/${file}`))})
 }
 const result=joinWttColumns(tables,londonJoinOptions(osm))
 await writeFile(`${cache}/normalized.json`,JSON.stringify(result))
 const audit=supplementPublicCalls(result,await londonPublicColumns(cache))
 const nonFriday=new Set(['BCZ:300','BCZ:1800','BCZ:3600','BCZ:5280','BCZ:2220','WAE:86160','WAE:84780'])
 const unresolved=audit.unmatched.filter(r=>!nonFriday.has(`${r.code}:${r.time}`))
 if(unresolved.length||audit.ambiguous.length)throw new Error(`Unresolved public timetable calls: ${JSON.stringify(unresolved)}; ambiguous: ${JSON.stringify(audit.ambiguous)}`)
 result.publicCallAudit={added:audit.added,excludedNonFridayColumns:audit.unmatched,ambiguous:audit.ambiguous,sourceColumns:audit.sourceColumns,closedStations:[{code:'BRS',reason:'Closed until 20 September 2026 for improvement works',table:'NRT161',page:1}]}
 const urls=JSON.parse(await readFile(`${cache}/enrt-sources.json`))
 for(const table of ['014','051','161','180','181','182','183','184','185','186','189','190','191'])result.sources.push({table:`NRT${table}`,sha256:hash(await readFile(`${cache}/NRT${table}.pdf`)),url:urls[table]})
 await writeFile(`${cache}/supplement-audit.json`,JSON.stringify(result.publicCallAudit,null,2))
 const {boundary}=JSON.parse(await readFile('fixtures/tfl/all-change-geography.json'))
 const routed=routeRailJourneys(result,osm,{...londonRoutingOptions,boundary})
 await writeFile(`${cache}/routed.json`,JSON.stringify(routed))
 return routed
}
