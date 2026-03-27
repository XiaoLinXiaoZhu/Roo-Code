import { generateEventId, resetEventIdCounter } from "../eventId"

describe("generateEventId", () => {
	beforeEach(() => {
		resetEventIdCounter()
	})

	test("generates IDs with evt_ prefix", () => {
		const id = generateEventId()
		expect(id).toMatch(/^evt_\d+_\d+$/)
	})

	test("generates monotonically increasing counter", () => {
		const id1 = generateEventId()
		const id2 = generateEventId()
		const id3 = generateEventId()

		// 提取 counter 部分
		const counter1 = parseInt(id1.split("_")[2])
		const counter2 = parseInt(id2.split("_")[2])
		const counter3 = parseInt(id3.split("_")[2])

		expect(counter2).toBeGreaterThan(counter1)
		expect(counter3).toBeGreaterThan(counter2)
	})

	test("reset counter works", () => {
		generateEventId() // counter = 0 -> 1
		generateEventId() // counter = 1 -> 2
		resetEventIdCounter()
		const id = generateEventId()
		const counter = parseInt(id.split("_")[2])
		expect(counter).toBe(0)
	})
})
