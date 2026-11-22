# Dynamic Island for Windows

윈도우 바탕화면 위에 얹는 글래스 아일랜드입니다. 검은 알약을 누르면 홈으로 펼쳐지고, 음악·Gemini·라디오·메일·일정이 그 안에서 이어집니다.

## 실행

```bash
npm install
npm run dev
```

개발 서버는 [http://127.0.0.1:4731](http://127.0.0.1:4731) 입니다. 공개 페이지는 [https://makaiopluto-maker.github.io/dynamic-island/](https://makaiopluto-maker.github.io/dynamic-island/) 입니다.

## 조작

- 알약을 클릭하면 홈이 펼쳐집니다. 가운데 주황 점이나 바깥을 누르면 접힙니다. 시간 옆 `···`은 메뉴입니다.
- 아래 독에서 Home, Music, Gemini, Radio로 이동합니다. 양쪽 `+`는 설정입니다.
- YouTube Music은 목록에서 곡을 고르거나 검색합니다. Spotify는 로그인 후 플레이어에서 재생합니다.
- 라디오는 뉴스 채널과 음량 슬라이더를 씁니다.
- Gemini는 API 키를 한 번 저장하면 바로 채팅합니다. 키는 [Google AI Studio](https://aistudio.google.com/apikey)에서 만듭니다.
- `1` `2` `3` `4`는 홈, 음악, Gemini, Radio입니다. `Esc`는 한 단계씩 접습니다.

## 연결된 것들

- **날씨**는 서울 기온입니다.
- **메일·캘린더**는 Google 연결 후에만 채워집니다. 연결 전에는 비어 있고 “연결 필요”로 표시됩니다.
- **음악**은 YouTube Music / Spotify입니다.
- **라디오**는 YTN, KBS 1라디오, MBC 표준FM, CBS 표준FM, SBS 러브FM, TBS 교통방송입니다.
- **Gemini**는 기기에 저장한 API 키로 바로 호출합니다.
- **조명**은 윈도우 설치본에서만 모니터 밝기를 바꿉니다.

## 윈도우 설치 파일

`Dynamic-Island-Setup.exe`를 받아 설치합니다. 이미 설치되어 있으면 같은 파일로 제거하거나 다시 설치할 수 있습니다. 설치 후 검은 알약이 화면 맨 위 가운데에 붙고, 트레이에서 다시 보이거나 끝낼 수 있습니다.

```bash
npm run dist:win
```

결과물은 `release/Dynamic-Island-Setup.exe` 입니다.
