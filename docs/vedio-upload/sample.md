import os
import base64

from openai import OpenAI

client = OpenAI(
api_key=os.environ.get("MOONSHOT_API_KEY"),
base_url="https://api.moonshot.cn/v1",
)

# 在这里，你需要将 kimi.mp4 文件替换为你想让 Kimi 识别的视频的地址

video_path = "kimi.mp4"

with open(video_path, "rb") as f:
video_data = f.read()

# 我们使用标准库 base64.b64encode 函数将视频编码成 base64 格式的 video_url

video_url = f"data:video/{os.path.splitext(video_path)[1]};base64,{base64.b64encode(video_data).decode('utf-8')}"

completion = client.chat.completions.create(
model="kimi-k2.5",
messages=[
{"role": "system", "content": "你是 Kimi。"},
{
"role": "user", # 注意这里，content 由原来的 str 类型变更为一个 list，这个 list 中包含多个部分的内容，视频（video_url）是一个部分（part），# 文字（text）是一个部分（part）
"content": [
{
"type": "video_url", # <-- 使用 video_url 类型来上传视频，内容为使用 base64 编码过的视频内容
"video_url": {
"url": video_url,
},
},
{
"type": "text",
"text": "请描述视频的内容。", # <-- 使用 text 类型来提供文字指令，例如"描述视频内容"
},
],
},
],
)

print(completion.choices[0].message.content)
