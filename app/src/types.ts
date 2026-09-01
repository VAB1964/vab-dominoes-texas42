export type Pip=0|1|2|3|4|5|6; export type Domino=`${Pip}-${Pip}`;
export type Trump=Pip|"doubles"|"follow-me";
export type Phase="lobby"|"bidding"|"widow"|"trump"|"playing"|"hand-end"|"complete";
export type Difficulty="easy"|"medium"|"hard";
export interface Rules {minimumBid:3|4|5;allPass:"redeal"|"force-dealer";declareTrumpBeforeWidow:boolean;widow:"exchange"|"optional"|"none";moonScoring:"points"|"instant";allowDoublesTrump:boolean;allowFollowMe:boolean;overcallMoon:boolean;targetScore:number;}
export interface Player {id:string;name:string;seat:number;score:number;connected:boolean;ready:boolean;isAI:boolean;difficulty:Difficulty|null;dominoCount:number;tricks:number;}
export interface GameView {phase:Phase;dealerSeat:number;turnSeat:number|null;bidderSeat:number|null;highBid:number|null;trump:Trump|null;ledSuit:Pip|null;trick:{seat:number;domino:Domino}[];hand:Domino[];widowCount:number;handNumber:number;message:string;winnerSeat:number|null;}
export interface RoomView {roomId:string;revision:number;hostPlayerId:string;players:Player[];rules:Rules;game:GameView;}
