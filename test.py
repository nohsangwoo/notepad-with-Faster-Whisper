import asyncio
import websockets

async def test_websocket():
    uri = "ws://127.0.0.1:8000/ws/transcribe/"  # 서버의 실제 WebSocket 경로 확인 필요
    async with websockets.connect(uri) as websocket:
        print("🔗 서버에 연결됨!")

        # 테스트용 음성 데이터 전송
        with open("test_message2.m4a", "rb") as audio_file:
            audio_data = audio_file.read()
            await websocket.send(audio_data)

        # 서버에서 변환된 텍스트 수신
        response = await websocket.recv()
        print("🎤 변환된 텍스트:", response)

asyncio.run(test_websocket())
