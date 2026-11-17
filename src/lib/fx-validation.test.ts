import {describe,expect,it} from "bun:test";
import {identifyFxFile,validFxUrl,parseFxYouTubeId,looksLikeFxYouTubeUrl,normalizeFxVolume,fxSeconds,classifyFxAfter,fxEventsForInitialOverlay} from "./fx-validation";
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
  it("recognizes official YouTube video, share, live, embed and Shorts URLs",()=>{
    const id="dQw4w9WgXcQ";
    const valid=[
      "https://www.youtube.com/watch?v="+id+"&t=20",
      "https://music.youtube.com/watch?v="+id,
      "https://m.youtube.com/watch?v="+id,
      "https://youtu.be/"+id+"?si=abc",
      "https://www.youtube.com/shorts/"+id,
      "https://www.youtube.com/live/"+id+"?feature=share",
      "https://www.youtube-nocookie.com/embed/"+id,
    ];
    for(const link of valid){
      expect(parseFxYouTubeId(link)).toBe(id);
      expect(validFxUrl(link)).toBe(true);
    }
    expect(parseFxYouTubeId("https://youtube.com.evil.test/watch?v="+id)).toBeNull();
    expect(parseFxYouTubeId("https://www.youtube.com/playlist?list=123")).toBeNull();
    expect(parseFxYouTubeId("https://youtu.be/bad")).toBeNull();
    expect(parseFxYouTubeId("http://youtu.be/"+id)).toBeNull();
    expect(validFxUrl("https://www.youtube.com/watch?v=wrong")).toBe(false);
    expect(looksLikeFxYouTubeUrl("https://www.youtube.com/playlist?list=foo")).toBe(true);
    expect(looksLikeFxYouTubeUrl("https://youtube.com.evil.test/watch?v="+id)).toBe(false);
  });
  it("recovers a freshly played effect when the OBS source loads late",()=>{
    const now=Date.parse("2026-11-17T12:00:00.000Z");
    const events=[
      {id:11,command:"PLAY" as const,createdAt:new Date(now-31_000).toISOString(),
        payload:{seconds:30}},
      {id:12,command:"PLAY" as const,createdAt:new Date(now-3500).toISOString(),
        payload:{seconds:5}},
      {id:13,command:"STOP_ALL" as const,createdAt:new Date(now-70000).toISOString()},
      {id:14,command:"PLAY" as const,createdAt:new Date(now-3000).toISOString(),
        payload:{seconds:30}},
      {id:14,command:"PLAY" as const,createdAt:new Date(now-3000).toISOString(),
        payload:{seconds:30}},
    ];
    expect(fxEventsForInitialOverlay(events,now).map(event=>event.id)).toEqual([12,14]);
    expect(fxEventsForInitialOverlay(events,now+35_000)).toEqual([]);
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