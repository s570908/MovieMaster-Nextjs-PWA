const CACHE_NAME = "MOVIE_MASTER_V1";
const DB_NAME = "MovieMaster";
const DB_VERSION = 1;
const DB_STORE_NAME = "myStore";

async function cacheCoreAssets() {
  const cache = await caches.open(CACHE_NAME);
  // 필수 리소스들을 서버로부터 미리 다운로드하여 캐시에 저장
  return await cache.addAll([
    "/",
    "/imdb-logo.svg",
    "/rotten-tomatoes-logo.svg",
    "/fallback",
  ]);
}

// 1. 등록 요청: 웹페이지(일반적으로 메인 JavaScript 파일)에서 다음과 같은 코드로 서비스 워커를 등록합니다:
//      navigator.serviceWorker.register('/service-worker.js')
// 2. 스크립트 다운로드: 브라우저는 지정된 경로에서 서비스 워커 스크립트 파일을 다운로드합니다.
// 3. 파싱 및 초기화: 브라우저가 서비스 워커 스크립트를 파싱하고 초기 실행합니다.
// 4. 설치 단계 시작: 서비스 워커는 "installing" 상태가 되고, 이때 install 이벤트가 발생합니다.
self.addEventListener("install", (event) => {
  event.waitUntil(cacheCoreAssets());
  self.skipWaiting();  // 새로 설치된 서비스 워커가 즉시 활성화되도록 함
});

async function clearOldCaches() {
  const cacheNames = await caches.keys();
  return await Promise.all(
    cacheNames
      .filter((name) => name !== CACHE_NAME)
      .map((name_1) => caches.delete(name_1))
  );
}

self.addEventListener("activate", (event) => {
  event.waitUntil(clearOldCaches());
  self.clients.claim();
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(DB_STORE_NAME, { keyPath: "url" });
    };
  });
}

async function addData(url, jsonData) {
  const db = await openDb();
  const transaction = db.transaction(DB_STORE_NAME, "readwrite");
  const store = transaction.objectStore(DB_STORE_NAME);

  const data = {
    url,
    response: JSON.stringify(jsonData),
  };

  const request = store.put(data);
  await new Promise((resolve, reject) => {
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getData(url) {
  try {
    const db = await openDb();
    const transaction = db.transaction(DB_STORE_NAME, "readonly");
    const store = transaction.objectStore(DB_STORE_NAME);

    const request = store.get(url);

    const result = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (result && result.response) {
      return JSON.parse(result.response);
    }

    return null;
  } catch (error) {
    console.error("Error retrieving from IndexedDB:", error);
    return null;
  }
}

async function cacheFirstStrategy(request) {
  try {
    const cache = await caches.open(CACHE_NAME);
    const cachedResponse = await cache.match(request);

    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    const responseClone = networkResponse.clone();
    await cache.put(request, responseClone);
    return networkResponse;
  } catch (error) {
    console.error("Cache first strategy failed:", error);
    return caches.match("/offline");
  }
}

async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const responseClone = networkResponse.clone();
      const responseData = await responseClone.json();
      await addData(request.url, responseData);
      return networkResponse;
    }

    throw new Error("Network response was not ok");
  } catch (error) {
    console.error("Network first strategy failed:", error);
    const cachedResponse = await getData(request.url);

    if (cachedResponse) {
      console.log("Using cached response:", cachedResponse);
      return new Response(JSON.stringify(cachedResponse), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("[]", { status: 200 });
  }
}

async function dynamicCaching(request, cacheName = CACHE_NAME) {
    try {
        // 먼저 요청 URL이 캐시 가능한지 확인
        const url = request.url;
        
        // 지원되지 않는 스킴 필터링
        if (url.startsWith('chrome-extension://') || 
            url.startsWith('chrome://') || 
            url.startsWith('data:') || 
            url.startsWith('blob:')) {
            console.log('Skipping non-cacheable URL:', url);
            // 지원되지 않는 URL인 경우 그대로 네트워크 요청을 반환
            return fetch(request);
        }
        
        const cache = await caches.open(cacheName);
        const response = await fetch(request);
        
        if (response && response.ok) {
            await cache.put(request.clone(), response.clone());
        }
        
        return response;
    } catch (error) {
        console.error('Dynamic caching failed:', error);
        return caches.match(request) || caches.match('/fallback');
    }
}

// 기존의 fetch 이벤트 리스너를 삭제하고 이것만 유지
self.addEventListener("fetch", (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // 지원되지 않는 URL 스킴 필터링
    if (request.url.startsWith('chrome-extension://') || 
        request.url.startsWith('chrome://') || 
        request.url.startsWith('data:') || 
        request.url.startsWith('blob:')) {
        return; // 기본 브라우저 처리로 넘김
    }
    
     // OMDb API 요청:  OMDb API에서 받은 영화 정보, JSON 형식의 데이터 -> IndexedDB에 저장. 
     // 응답 형식: JSON 데이터만 추출하여 저장 (HTTP 헤더 등 제외)
    if (url.origin === "https://www.omdbapi.com") {
        event.respondWith(networkFirstStrategy(request));
    } 
    // 페이지 탐색 -> Cache API에 저장
    else if (event.request.mode === "navigate") {
        event.respondWith(cacheFirstStrategy(request));
    } 
    // 기타 리소스(이미지, 스크립트 등) -> Cache API에 저장
    else {
        event.respondWith(dynamicCaching(request));
    }
});
