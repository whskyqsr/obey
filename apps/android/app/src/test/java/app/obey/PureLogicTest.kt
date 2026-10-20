package app.obey

import app.obey.api.Me
import app.obey.api.Occurrence
import app.obey.api.OccurrenceStatus
import app.obey.api.RescheduleInput
import app.obey.api.Role
import app.obey.api.TaskInput
import app.obey.api.Weekday
import app.obey.markdown.LinePrefix
import app.obey.markdown.MarkdownEdits
import app.obey.markdown.MarkdownParser
import app.obey.markdown.MdBlock
import app.obey.markdown.MdSpan
import app.obey.markdown.TextEdit
import app.obey.recurrence.MonthlyMode
import app.obey.recurrence.RecurrenceDraft
import app.obey.recurrence.RepeatKind
import app.obey.recurrence.describe
import app.obey.api.Frequency
import app.obey.api.RecurrenceRule
import app.obey.api.Schedule
import java.time.LocalDate
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** JVM tests for the framework-free parts: recurrence summaries, model JSON, Markdown editing and parsing. */
class PureLogicTest {
    val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = true; coerceInputValues = true }

    @Test
    fun describes() {
        val start = LocalDate.parse("2026-10-16")
        assertEquals("Every 3 days", describe(RecurrenceDraft(RepeatKind.Daily, interval = 3).toSchedule(start)))
        assertEquals("Every 2 weeks on Mon, Thu", describe(RecurrenceDraft(RepeatKind.Weekly, interval = 2, weekdays = setOf(Weekday.TH, Weekday.MO)).toSchedule(start)))
        assertEquals("Monthly on the 2nd Tue", describe(RecurrenceDraft(RepeatKind.Monthly, monthlyMode = MonthlyMode.NthWeekday, nth = 2, nthWeekday = Weekday.TU).toSchedule(start)))
        assertEquals("Monthly on the last day", describe(RecurrenceDraft(RepeatKind.Monthly, monthlyMode = MonthlyMode.LastDay).toSchedule(start)))
        assertEquals("3 of every 7 days", describe(RecurrenceDraft(RepeatKind.Cycle, cycleOn = 3, cycleOff = 4).toSchedule(start)))
        assertEquals("Every 3 days after completion", describe(RecurrenceDraft(RepeatKind.Daily, interval = 3, afterCompletion = true).toSchedule(start)))
        assertEquals("Once", describe(RecurrenceDraft().toSchedule(start)))
        assertEquals("Weekly on Fri", describe(RecurrenceDraft(RepeatKind.Weekly).toSchedule(start)))
        val s = RecurrenceDraft(RepeatKind.Monthly, interval = 2, monthlyMode = MonthlyMode.DayOfMonth, monthDay = 31).toSchedule(start)
        assertEquals(RecurrenceDraft(RepeatKind.Monthly, interval = 2, monthlyMode = MonthlyMode.DayOfMonth, monthDay = 31), RecurrenceDraft.fromSchedule(s))
    }

    @Test
    fun serializes() {
        val s = RecurrenceDraft(RepeatKind.Daily, interval = 3).toSchedule(LocalDate.parse("2026-10-16"))
        val input = TaskInput(title = "Kneel", assigneeId = "u", schedule = s, timezone = "Europe/London")
        val out = json.encodeToString(TaskInput.serializer(), input)
        assertTrue("\"rewardId\":null" in out)
        assertFalse("byWeekday" in out)
        assertFalse("anchor" in out)
        val r = json.encodeToString(RescheduleInput.serializer(), RescheduleInput(delayHours = 24))
        assertEquals("""{"scope":"this","delayHours":24}""", r)
        val occ = json.decodeFromString(Occurrence.serializer(), """{"id":"a","seriesId":"b","title":"t","assigneeId":"u","points":5,"originalDate":"2026-10-16","dueAt":"2026-10-16T18:00:00.000Z","rescheduled":false,"status":"pending","completedAt":null,"noteMd":null,"extra":1}""")
        assertEquals(OccurrenceStatus.Pending, occ.status)
        val me = json.decodeFromString(Me.serializer(), """{"user":{"id":"u","displayName":"J","email":null},"relationships":[{"id":"r","name":"Us","members":[{"userId":"u","displayName":"J","role":"dominant"}],"reschedulePolicy":"request","weeklyDelayAllowance":2,"createdAt":"x"}]}""")
        assertEquals(Role.Dominant, me.relationships[0].members[0].role)
    }

    @Test
    fun edits() {
        assertEquals(TextEdit("a **b** c", 4, 5), MarkdownEdits.toggleInline("a b c", 2, 3, "**"))
        assertEquals(TextEdit("a b c", 2, 3), MarkdownEdits.toggleInline("a **b** c", 4, 5, "**"))
        assertEquals(TextEdit("****", 2, 2), MarkdownEdits.toggleInline("", 0, 0, "**"))
        assertEquals("one\n- two\n- three", MarkdownEdits.toggleLinePrefix("one\ntwo\nthree", 5, 10, LinePrefix.Bullet).text)
        assertEquals("one\ntwo\nthree", MarkdownEdits.toggleLinePrefix("one\n- two\n- three", 5, 14, LinePrefix.Bullet).text)
        assertEquals("- [ ] x", MarkdownEdits.toggleLinePrefix("- x", 3, 3, LinePrefix.Checklist).text)
        assertEquals("1. a\n2. b", MarkdownEdits.toggleLinePrefix("a\nb", 0, 3, LinePrefix.Numbered).text)
        assertEquals("# Title", MarkdownEdits.toggleLinePrefix("Title", 0, 0, LinePrefix.Heading1).text)
        assertEquals(TextEdit("- a\n- ", 6, 6), MarkdownEdits.continueList("- a\n", 4))
        assertEquals(TextEdit("- [x] a\n- [ ] ", 14, 14), MarkdownEdits.continueList("- [x] a\n", 8))
        assertEquals(TextEdit("1. a\n2. ", 8, 8), MarkdownEdits.continueList("1. a\n", 5))
        assertEquals(TextEdit("x\n", 2, 2), MarkdownEdits.continueList("x\n- \n", 5))
        assertNull(MarkdownEdits.continueList("plain\n", 6))
        assertEquals("a\n- [x] b", MarkdownEdits.toggleCheckbox("a\n- [ ] b", 1))
    }

    @Test
    fun parses() {
        val b = MarkdownParser.parse("# H\n- [x] done **now**\n- item\n1. first\n> q\n\nsnake_case and *it*")
        assertTrue(b[0] is MdBlock.Heading)
        assertTrue((b[1] as MdBlock.Check).checked)
        assertTrue(b[2] is MdBlock.Bullet); assertTrue(b[3] is MdBlock.Numbered); assertTrue(b[4] is MdBlock.Quote); assertTrue(b[5] is MdBlock.Blank)
        val spans = (b[6] as MdBlock.Paragraph).inline
        assertEquals(listOf(MdSpan("snake_case and "), MdSpan("it", italic = true)), spans)
        assertEquals(listOf(MdSpan("done "), MdSpan("now", bold = true)), (b[1] as MdBlock.Check).inline)
    }

    @Test
    fun yearlySchedulesOpenAsEvery12Months() {
        val draft = RecurrenceDraft.fromSchedule(Schedule(start = "2026-03-05", rule = RecurrenceRule(Frequency.Yearly, interval = 1)))
        assertEquals(RepeatKind.Monthly, draft.kind)
        assertEquals(12, draft.interval)
        assertEquals(MonthlyMode.DayOfMonth, draft.monthlyMode)
        assertEquals(5, draft.monthDay)
        val rule = draft.toSchedule(LocalDate.parse("2026-03-05")).rule!!
        assertEquals(Frequency.Monthly, rule.freq)
        assertEquals(12, rule.interval)
        assertEquals(listOf(5), rule.byMonthDay)
    }
}
