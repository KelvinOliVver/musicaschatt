import { describe, expect, it } from "bun:test";
import { normalizeRoomSlug, roomFromSearch, estimateWaitingSeconds, displayWait } from "./room-utils";
describe("multi-room isolation and wait estimates",()=>{
 it("normalizes only real channel slugs",()=>{
   expect(normalizeRoomSlug(" @RoceiraPlay ")).toBe("roceiraplay");
   expect(normalizeRoomSlug("../sql")).toBeNull();
   expect(normalizeRoomSlug("")).toBeNull();
   expect(roomFromSearch("?channel=OtherStreamer")).toBe("otherstreamer");
   expect(roomFromSearch("?channel=../no")).toBe("roceiraplay");
 });
 it("estimates waiting using known duration and an honest unknown fallback",()=>{
   const tracks=[{durationSeconds:90,priority:false,position:0},{durationSeconds:null,priority:false,position:1},{durationSeconds:40,priority:false,position:2}];
   expect(estimateWaitingSeconds(tracks,2)).toBe(270);
   expect(displayWait(270)).toBe("~5 min");
   expect(displayWait(0)).toBe("Próximo");
 });
});
