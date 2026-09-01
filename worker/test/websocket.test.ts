import {SELF} from "cloudflare:test";
import {describe,expect,it} from "vitest";

function nextMessage(ws:WebSocket,timeout=2000){return new Promise<any>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("WebSocket response timed out")),timeout);ws.addEventListener("message",event=>{clearTimeout(timer);resolve(JSON.parse(String(event.data)))},{once:true})})}

describe("browser WebSocket commands",()=>{
  it("accepts a human bid after AI players act",async()=>{
    const roomResponse=await SELF.fetch("https://example.com/api/dominoes/rooms",{method:"POST"});
    const {roomId}=await roomResponse.json() as {roomId:string};
    const response=await SELF.fetch(`https://example.com/api/dominoes/rooms/${roomId}/ws`,{headers:{Upgrade:"websocket"}});
    expect(response.status).toBe(101);
    const ws=response.webSocket!;ws.accept();
    await nextMessage(ws);
    ws.send(JSON.stringify({type:"CREATE_ROOM",payload:{name:"Vince",gameType:"moon"},expectedRevision:0,playerId:null}));
    const created=await nextMessage(ws);const playerId=created.playerId as string;
    let revision=created.view.revision as number;
    for(const seat of [1,2]){ws.send(JSON.stringify({type:"ADD_AI",payload:{seat,difficulty:"medium"},expectedRevision:revision,playerId}));const message=await nextMessage(ws);if(message.view)revision=message.view.revision}
    ws.send(JSON.stringify({type:"SET_READY",payload:{ready:true},expectedRevision:revision,playerId}));
    revision=(await nextMessage(ws)).view.revision;
    ws.send(JSON.stringify({type:"START_GAME",payload:{},expectedRevision:revision,playerId}));
    let state=await nextMessage(ws);
    for(let guard=0;guard<5&&state.view?.game.turnSeat!==0;guard++)state=await nextMessage(ws);
    expect(state.view.game).toMatchObject({phase:"bidding",turnSeat:0,highBid:4});
    revision=state.view.revision;
    ws.send(JSON.stringify({type:"BID",payload:{bid:5},expectedRevision:revision,playerId}));
    let afterBid=await nextMessage(ws);
    expect(afterBid.error).toBeUndefined();
    expect(afterBid.view.game.highBid).toBe(5);
    for(let guard=0;guard<5&&afterBid.view?.game.phase!=="widow";guard++)afterBid=await nextMessage(ws);
    expect(afterBid.view.game).toMatchObject({phase:"widow",bidderSeat:0,turnSeat:0});
    expect(afterBid.view.game.hand).toHaveLength(8);
    revision=afterBid.view.revision;
    ws.send(JSON.stringify({type:"DISCARD",payload:{domino:afterBid.view.game.hand[0]},expectedRevision:revision,playerId}));
    const afterDiscard=await nextMessage(ws);
    expect(afterDiscard.error).toBeUndefined();
    expect(afterDiscard.view.game).toMatchObject({phase:"trump",bidderSeat:0,turnSeat:0});
    expect(afterDiscard.view.game.hand).toHaveLength(7);
    ws.close();
  });
});
