import {describe,expect,it} from "bun:test";
import {parseTrackInput} from "./link-parser";
describe("safe link recognition",()=>{
 it("accepts supported known video URLs",()=>{
  expect(parseTrackInput("https://youtu.be/dQw4w9WgXcQ")?.source).toBe("youtube");
  expect(parseTrackInput("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.trackId).toBe("dQw4w9WgXcQ");
 });
 it("rejects unknown domains and invalid video formats",()=>{
  expect(parseTrackInput("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull();
  expect(parseTrackInput("javascript:alert(1)")).toBeNull();
 });
});
