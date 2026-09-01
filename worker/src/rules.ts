export type Pip=0|1|2|3|4|5|6; export type Domino=`${Pip}-${Pip}`; export type Trump=Pip|"doubles"|"follow-me";
export const ends=(d:Domino)=>d.split("-").map(Number) as [Pip,Pip]; export const isDouble=(d:Domino)=>{const[a,b]=ends(d);return a===b};
export function setForMoon(includeWidow=true):Domino[]{const out:Domino[]=[];for(let a=0;a<=6;a++)for(let b=0;b<=a;b++){if((a===0||b===0)&&!(a===0&&b===0))continue;out.push(`${a}-${b}` as Domino)}if(!includeWidow)return out.filter(d=>d!=="0-0");return out}
export function suitMembership(d:Domino,trump:Trump):Pip[]{const[a,b]=ends(d);if(typeof trump==="number"&&(a===trump||b===trump))return [trump];if(trump==="doubles"&&a===b)return [];return a===b?[a]:[a,b]}
export function isTrump(d:Domino,trump:Trump){const[a,b]=ends(d);return typeof trump==="number"?(a===trump||b===trump):trump==="doubles"&&a===b}
export function ledSuit(d:Domino,trump:Trump):Pip|null{if(isTrump(d,trump))return null;const[a,b]=ends(d);return Math.max(a,b) as Pip}
export function legalPlays(hand:Domino[],lead:Domino|null,trump:Trump):Domino[]{if(!lead)return hand;const leadTrump=isTrump(lead,trump);const suit=ledSuit(lead,trump);const following=hand.filter(d=>leadTrump?isTrump(d,trump):suit!==null&&suitMembership(d,trump).includes(suit));return following.length?following:hand}
function rank(d:Domino,suit:Pip|null,trump:Trump){const[a,b]=ends(d);if(isTrump(d,trump)){if(trump==="doubles")return 100+a;const other=a===trump?b:a;return 100+(a===b?10:other)}if(suit===null||!suitMembership(d,trump).includes(suit))return -1;const other=a===suit?b:a;return a===b?20:other}
export function trickWinner(plays:{seat:number;domino:Domino}[],trump:Trump){const suit=ledSuit(plays[0]!.domino,trump);return plays.reduce((best,p)=>rank(p.domino,suit,trump)>rank(best.domino,suit,trump)?p:best).seat}
export function shuffle<T>(items:T[],random=Math.random){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[a[i],a[j]]=[a[j]!,a[i]!]}return a}
