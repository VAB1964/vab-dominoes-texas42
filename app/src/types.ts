export type Pip=0|1|2|3|4|5|6; export type Domino=`${Pip}-${Pip}`;
export type Trump=Pip|"doubles"|"follow-me";
export type GameType="moon"|"texas42"; export type Phase="lobby"|"bidding"|"widow"|"trump"|"playing"|"hand-end"|"complete";
export type Difficulty="easy"|"medium"|"hard";
export type ServerProtocolVersion="v2";
export interface Rules {minimumBid:3|4|5;allPass:"redeal"|"force-dealer";declareTrumpBeforeWidow:boolean;widow:"exchange"|"optional"|"none";moonScoring:"points"|"instant";allowDoublesTrump:boolean;allowFollowMe:boolean;overcallMoon:boolean;targetScore:number;}
export interface Player {id:string;name:string;seat:number;score:number;connected:boolean;ready:boolean;isAI:boolean;difficulty:Difficulty|null;dominoCount:number;tricks:number;handPoints:number;team:number|null;}
export interface GameView {phase:Phase;dealerSeat:number;turnSeat:number|null;bidderSeat:number|null;highBid:number|null;trump:Trump|null;ledSuit:Pip|null;trick:{seat:number;domino:Domino}[];hand:Domino[];widowCount:number;handNumber:number;message:string;winnerSeat:number|null;teamMarks:[number,number];teamHandPoints:[number,number];winnerTeam:number|null;openingDraw:{seat:number;domino:Domino}[];openingLeaderSeat:number|null;openingDrawActive:boolean;handId:number;trickId:number;nextPlayId:number;}
export interface RoomView {roomId:string;revision:number;hostPlayerId:string;gameType:GameType;players:Player[];rules:Rules;game:GameView;}
export interface TrickPlayEvent {type:"PLAY_ADDED";handId:number;trickId:number;playId:number;seat:number;domino:Domino}
export interface TrickCompletedEvent {type:"TRICK_COMPLETED";handId:number;trickId:number;winnerSeat:number;plays:{playId:number;seat:number;domino:Domino}[]}
export interface HandCompletedEvent {type:"HAND_COMPLETED";handId:number;phase:Extract<Phase,"hand-end"|"complete">;message:string}
export type RoomEvent=TrickPlayEvent|TrickCompletedEvent|HandCompletedEvent;
export interface EventEnvelope {protocol:ServerProtocolVersion;seq:number;serverTs:number;event:RoomEvent}
export interface PresentationSync {seq:number;snapshot:RoomView;reason:"welcome"|"resync"}
export type ServerMessage=
  |{type:"CONNECTED";protocol:ServerProtocolVersion}
  |{type:"WELCOME";protocol:ServerProtocolVersion;playerId:string;reconnectToken:string|null;snapshot:RoomView;seq:number}
  |{type:"SNAPSHOT";protocol:ServerProtocolVersion;snapshot:RoomView;seq:number}
  |{type:"EVENT";protocol:ServerProtocolVersion;seq:number;serverTs:number;event:RoomEvent}
  |{type:"ERROR";protocol:ServerProtocolVersion;error:{message:string}};
