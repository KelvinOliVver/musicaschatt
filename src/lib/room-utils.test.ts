import { describe, expect, it } from "bun:test";
import { normalizeRoomSlug, roomFromSearch, estimateWaitingSeconds, displayWait, classifyRoomQueueRow } from "./room-utils";
describe("multi-room isolation and wait estimates",()=>{
 it("normalizes only real channel slugs",()=>{
   expect(normalizeRoomSlug(" @RoceiraPlay ")).toBe("roceiraplay");
   expect(normalizeRoomSlug("../sql")).toBeNull();
   expect(normalizeRoomSlug("")).toBeNull();
   expect(roomFromSearch("?channel=OtherStreamer")).toBe("otherstreamer");
   expect(roomFromSearch("?channel=../no")).toBe("roceiraplay");
  it("keeps pending, rejected and other streamers out of playback",()=>{
  const row={room_slug:"roceiraplay",status:"queued",approval_status:"pending"};
  expect(classifyRoomQueueRow(row,"roceiraplay")).toBe("pending");
  expect(classifyRoomQueueRow({...row,approval_status:"approved"},"roceiraplay")).toBe("queued");
  expect(classifyRoomQueueRow({...row,approval_status:"rejected"},"roceiraplay")).toBe("ignore");
  expect(classifyRoomQueueRow({...row,approval_status:"approved"},"outra")).toBe("ignore");
  expect(classifyRoomQueueRow({...row,status:"playing",approval_status:"approved"},"roceiraplay")).toBe("playing");
 });
}); it("estimates waiting using known duration and an honest unknown fallback",()=>{
   const tracks=[{durationSeconds:90,priority:false,position:0},{durationSeconds:null,priority:false,position:1},{durationSeconds:40,priority:false,position:2}];
   expect(estimateWaitingSeconds(tracks,2)).toBe(270);
   expect(displayWait(270)).toBe("~5 min");
   expect(displayWait(0)).toBe("Próximo");
 });
});
