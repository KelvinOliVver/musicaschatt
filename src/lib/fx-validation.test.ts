import {describe,expect,it} from "bun:test";
import {identifyFxFile,validFxUrl,normalizeFxVolume,fxSeconds,classifyFxAfter} from "./fx-validation";
describe("RoceiraFX media and event safety",()=>{
  it("requires correct MIME+extension and size",()=>{
    expect(identifyFxFile({name:"som.mp3",size:1200,type:"audio/mpeg"}).kind).toBe("audio");
    expect(identifyFxFile({name:"foto.gif",size:900,type:"image/gif"}).kind).toBe("gif");
    expect(identifyFxFile({name:"x.exe",size:5,type:"audio/mpeg"}).error).toBeTruthy();
    expect(identifyFxFile({name:"x.mp4",size:70*1024*1024,type:"video/mp4"}).error).toBeTruthy();
  });
  it("refuses unsafe media links",()=>{
    expect(validFxUrl("https://cdn.example.com/som.mp3")).toBe(true);
    expect(validFxUrl("javascript:alert(1)")).toBe(false);
    expect(validFxUrl("http://private.invalid/a.mp4")).toBe(false);
    expect(validFxUrl("https://user:password@example.com/a")).toBe(false);
  });
  it("clamps settings",()=>{
    expect(normalizeFxVolume(150)).toBe(100);
    expect(normalizeFxVolume(-1)).toBe(0);
    expect(fxSeconds(0)).toBe(1);
    expect(fxSeconds(50)).toBe(30);
  });
  it("ignores replayed or duplicate events",()=>{
    const events=[{id:5,command:"PLAY" as const},{id:6,command:"STOP_ALL" as const},{id:6,command:"STOP_ALL" as const},{id:4,command:"PLAY" as const}];
    expect(classifyFxAfter(events,5).map(x=>x.id)).toEqual([6]);
  });
});