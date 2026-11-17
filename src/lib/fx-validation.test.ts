import {describe,expect,it} from "bun:test";
import {FX_MAX_DISPLAY_SECONDS,FX_SIZES,identifyFxFile,validFxUrl,parseFxYouTubeId,looksLikeFxYouTubeUrl,normalizeFxVolume,fxSeconds,classifyFxAfter,fxEventsForInitialOverlay,nextFxOverlayCursor} from "./fx-validation";
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
    expect(fxEventsForInitialOverlay(events,now).map(event=>event.id)).toEqual([14]);
    expect(fxEventsForInitialOverlay(events,now+35_000)).toEqual([]);
  });
  it("does not resurrect media killed by STOP_ALL on OBS restart",()=>{
    const now=Date.parse("2026-11-17T12:00:00Z");
    const events=[
      {id:21,command:"PLAY" as const,createdAt:new Date(now-20_000).toISOString(),payload:{seconds:30}},
      {id:22,command:"STOP_ALL" as const,createdAt:new Date(now-19_000).toISOString()},
      {id:23,command:"PLAY" as const,createdAt:new Date(now-1000).toISOString(),payload:{seconds:6}},
    ];
    expect(fxEventsForInitialOverlay(events,now).map(event=>event.id)).toEqual([23]);
  });
  it("keeps a long-running image visible after OBS reconnects",()=>{
    const now=Date.parse("2026-11-17T12:00:00Z");
    const events=[
      {id:101,command:"PLAY" as const,createdAt:new Date(now-9*60_000).toISOString(),payload:{seconds:600}},
      {id:102,command:"PLAY" as const,createdAt:new Date(now-9*60_000).toISOString(),payload:{seconds:30}},
    ];
    expect(fxEventsForInitialOverlay(events,now).map(e=>e.id)).toEqual([101]);
    expect(fxEventsForInitialOverlay(events,now+2*60_000)).toEqual([]);
  });
  it("paginates bursts instead of skipping events after 30 results",()=>{
    const batch=Array.from({length:30},(_,i)=>({id:i+1,command:"PLAY" as const}));
    expect(nextFxOverlayCursor(null,65,batch)).toBe(30);
    expect(nextFxOverlayCursor(30,65,batch.map(x=>({...x,id:x.id+30})))).toBe(60);
    expect(nextFxOverlayCursor(60,65,[{id:65,command:"STOP_ALL"}])).toBe(65);
    expect(nextFxOverlayCursor(null,999,[])).toBe(999);
  });
  it("allows full-screen sizes and 30-minute FX while clamping inputs",()=>{
    expect(FX_SIZES).toEqual(["small","medium","large","extra-large","fullscreen"]);
    expect(FX_MAX_DISPLAY_SECONDS).toBe(1800);
    expect(fxSeconds(1800)).toBe(1800);
    expect(fxSeconds(9999)).toBe(1800);
  });
  it("replays a long effect after OBS reconnect until it expires",()=>{
    const now=Date.parse("2026-11-17T12:00:00Z");
    const e={id:501,command:"PLAY" as const,createdAt:new Date(now-29*60_000).toISOString(),payload:{seconds:1800}};
    expect(fxEventsForInitialOverlay([e],now).map(x=>x.id)).toEqual([501]);
    expect(fxEventsForInitialOverlay([e],now+2*60_000)).toEqual([]);
  });
  it("clamps settings",()=>{
    expect(normalizeFxVolume(150)).toBe(100);
    expect(normalizeFxVolume(-1)).toBe(0);
    expect(fxSeconds(0)).toBe(1);
    expect(fxSeconds(50)).toBe(50);
    expect(fxSeconds(600)).toBe(600);
    expect(fxSeconds(999)).toBe(999);
  });
  it("ignores replayed or duplicate events",()=>{
    const events=[{id:5,command:"PLAY" as const},{id:6,command:"STOP_ALL" as const},{id:6,command:"STOP_ALL" as const},{id:4,command:"PLAY" as const}];
    expect(classifyFxAfter(events,5).map(x=>x.id)).toEqual([6]);
  });
});