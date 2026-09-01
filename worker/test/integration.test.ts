import {env} from "cloudflare:workers";
import {beforeEach,describe,expect,it} from "vitest";
import {GameRoom} from "../src/game-room";

let stub:DurableObjectStub<GameRoom>;
let roomId:string;

beforeEach(async()=>{
  roomId=`T${crypto.randomUUID().replaceAll("-","").slice(0,5).toUpperCase()}`.replace(/[IO01]/g,"A");
  stub=env.GAME_ROOMS.getByName(roomId);
  expect(await stub.initialize(roomId)).toBe(true);
});

async function command(type:string,payload:unknown={},playerId:string|null=null){return stub.executeForTest({type,payload,playerId,expectedRevision:0})}

async function createMixedGame(gameType:"moon"|"texas42"){
  const created=await command("CREATE_ROOM",{name:"Vince",gameType});
  expect(created.ok).toBe(true);
  const hostId=String(created.playerId);
  const joined=await command("JOIN_ROOM",{name:"Andrea"});
  expect(joined.ok).toBe(true);
  const guestId=String(joined.playerId);
  const seats=gameType==="moon"?3:4;
  for(let seat=2;seat<seats;seat++)expect((await command("ADD_AI",{seat,difficulty:seat%2?"medium":"hard"},hostId)).ok).toBe(true);
  expect((await command("SET_READY",{ready:true},hostId)).ok).toBe(true);
  expect((await command("SET_READY",{ready:true},guestId)).ok).toBe(true);
  expect((await command("START_GAME",{},hostId)).ok).toBe(true);
  return [hostId,guestId];
}

async function finishOneHand(humanIds:string[],gameType:"moon"|"texas42"){
  for(let guard=0;guard<250;guard++){
    const view=await stub.viewForTest(humanIds[0]!);
    if(!view)throw new Error("Room disappeared");
    if(view.game.phase==="hand-end"||view.game.phase==="complete")return view;
    const actor=view.players.find(player=>player.seat===view.game.turnSeat);
    const actorId=actor&&humanIds.includes(actor.id)?actor.id:null;
    if(!actorId)continue;
    const privateView=await stub.viewForTest(actorId);
    if(!privateView)throw new Error("Private view unavailable");
    if(view.game.phase==="bidding"){
      const result=await command("BID",{bid:gameType==="moon"?7:42},actorId);
      if(!result.ok)await command("PASS",{},actorId);
    }else if(view.game.phase==="trump"){
      expect((await command("CHOOSE_TRUMP",{trump:6},actorId)).ok).toBe(true);
    }else if(view.game.phase==="widow"){
      expect((await command("DISCARD",{domino:privateView.game.hand[0]},actorId)).ok).toBe(true);
    }else if(view.game.phase==="playing"){
      let played=false;
      for(const domino of privateView.game.hand){const result=await command("PLAY_DOMINO",{domino},actorId);if(result.ok){played=true;break}}
      expect(played).toBe(true);
    }
  }
  throw new Error("Hand did not finish within guard limit");
}

describe("mixed human and AI rooms",()=>{
  it("completes a three-player Moon hand and deals the next hand",async()=>{
    const humans=await createMixedGame("moon");
    const completed=await finishOneHand(humans,"moon");
    expect(completed.players).toHaveLength(3);
    expect(completed.players.filter(player=>player.isAI)).toHaveLength(1);
    expect(completed.players.reduce((sum,player)=>sum+player.tricks,0)).toBe(7);
    if(completed.game.phase==="hand-end"){
      expect((await command("NEXT_HAND",{},humans[0])).ok).toBe(true);
      expect((await stub.viewForTest(humans[0]!))!.game.handNumber).toBe(2);
    }
  });

  it("completes a four-player Texas 42 hand with partnership scoring",async()=>{
    const humans=await createMixedGame("texas42");
    const completed=await finishOneHand(humans,"texas42");
    expect(completed.players).toHaveLength(4);
    expect(completed.players.filter(player=>player.isAI)).toHaveLength(2);
    expect(completed.players.map(player=>player.team)).toEqual([0,1,0,1]);
    expect(completed.game.teamHandPoints[0]+completed.game.teamHandPoints[1]).toBe(42);
    expect(completed.game.teamMarks[0]+completed.game.teamMarks[1]).toBe(1);
  });
});
