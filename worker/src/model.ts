import type {Domino,Pip,Trump} from "./rules";
export type GameType="moon"|"texas42"; export type Difficulty="easy"|"medium"|"hard"; export type Phase="lobby"|"bidding"|"widow"|"trump"|"playing"|"hand-end"|"complete";
export type ServerProtocolVersion="v2";
export interface Rules{minimumBid:3|4|5;allPass:"redeal"|"force-dealer";declareTrumpBeforeWidow:boolean;widow:"exchange"|"optional"|"none";moonScoring:"points"|"instant";allowDoublesTrump:boolean;allowFollowMe:boolean;overcallMoon:boolean;targetScore:number}
export const DEFAULT_RULES:Rules={minimumBid:4,allPass:"redeal",declareTrumpBeforeWidow:false,widow:"exchange",moonScoring:"points",allowDoublesTrump:true,allowFollowMe:true,overcallMoon:false,targetScore:21};
export interface Player{id:string;name:string;seat:number;score:number;connected:boolean;ready:boolean;isAI:boolean;difficulty:Difficulty|null;reconnectToken:string|null;tricks:number;handPoints:number}
export interface Game{phase:Phase;dealerSeat:number;turnSeat:number|null;bidderSeat:number|null;highBid:number|null;passed:number[];trump:Trump|null;ledSuit:Pip|null;trick:{seat:number;domino:Domino}[];trickPlayIds:number[];hands:Record<number,Domino[]>;widow:Domino[];discard:Domino|null;handNumber:number;message:string;winnerSeat:number|null;teamMarks:[number,number];teamHandPoints:[number,number];winnerTeam:number|null;openingDraw:{seat:number;domino:Domino}[];openingLeaderSeat:number|null;openingDrawActive:boolean;handId:number;trickId:number;nextPlayId:number;eventSeq:number;}
export interface State{roomId:string;revision:number;hostPlayerId:string;gameType:GameType;players:Player[];rules:Rules;game:Game;createdAt:number}
export interface TrickPlayEvent{type:"PLAY_ADDED";handId:number;trickId:number;playId:number;seat:number;domino:Domino}
export interface TrickCompletedEvent{type:"TRICK_COMPLETED";handId:number;trickId:number;winnerSeat:number;plays:{playId:number;seat:number;domino:Domino}[]}
export interface HandCompletedEvent{type:"HAND_COMPLETED";handId:number;phase:Extract<Phase,"hand-end"|"complete">;message:string}
export type RoomEvent=TrickPlayEvent|TrickCompletedEvent|HandCompletedEvent;
export type WsServerMessage=
  |{type:"CONNECTED";protocol:ServerProtocolVersion}
  |{type:"WELCOME";protocol:ServerProtocolVersion;playerId:string;reconnectToken:string|null;snapshot:any;seq:number}
  |{type:"SNAPSHOT";protocol:ServerProtocolVersion;snapshot:any;seq:number}
  |{type:"EVENT";protocol:ServerProtocolVersion;seq:number;serverTs:number;event:RoomEvent}
  |{type:"ERROR";protocol:ServerProtocolVersion;error:{message:string}};
export const emptyGame=():Game=>({phase:"lobby",dealerSeat:0,turnSeat:null,bidderSeat:null,highBid:null,passed:[],trump:null,ledSuit:null,trick:[],trickPlayIds:[],hands:{},widow:[],discard:null,handNumber:0,message:"Waiting for players.",winnerSeat:null,teamMarks:[0,0],teamHandPoints:[0,0],winnerTeam:null,openingDraw:[],openingLeaderSeat:null,openingDrawActive:false,handId:0,trickId:1,nextPlayId:1,eventSeq:0});
