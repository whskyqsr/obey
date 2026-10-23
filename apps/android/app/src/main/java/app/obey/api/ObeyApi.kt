package app.obey.api

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.PATCH
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

/**
 * The Obey REST API (apps/api). Paths are relative to BuildConfig.API_BASE_URL.
 * Endpoints whose response the app doesn't use return Unit.
 */
interface ObeyApi {
    @GET("me")
    suspend fun me(): Me

    @PATCH("me")
    suspend fun updateMe(@Body body: UpdateMeInput): User

    @PATCH("me")
    suspend fun setWeekStart(@Body body: WeekStartInput): User

    @PATCH("me")
    suspend fun setQuietHours(@Body body: QuietHoursInput): User

    @PATCH("me")
    suspend fun setMutedNotifications(@Body body: MutedNotificationsInput): User

    @PATCH("me")
    suspend fun setNotifyDetails(@Body body: NotifyDetailsInput): User

    /** A square JPEG; the app crops and shrinks it first. */
    @PUT("me/avatar")
    suspend fun setAvatar(@Body image: RequestBody): User

    @DELETE("me/avatar")
    suspend fun deleteAvatar(): User

    /** Deletes the account and its sign-in for good; see the API's deleteAccount. */
    @DELETE("me")
    suspend fun deleteAccount()

    @GET("users/{id}/avatar")
    suspend fun avatar(@Path("id") userId: String, @Query("v") version: String): ResponseBody

    @POST("me/verification-email")
    suspend fun sendVerificationEmail(@Body body: VerificationEmailInput = VerificationEmailInput()): VerificationEmailResult

    // Photo proof
    @POST("me/proof-terms")
    suspend fun acceptProofTerms(@Body body: AcceptProofTermsInput = AcceptProofTermsInput()): User

    @PATCH("me")
    suspend fun setRevealProofs(@Body body: RevealProofsInput): User

    @GET("occurrences/{id}/photos")
    suspend fun proofPhotos(@Path("id") occurrenceId: String): List<ProofPhoto>

    /** A JPEG the app has already shrunk. */
    @POST("occurrences/{id}/photos")
    suspend fun addProofPhoto(@Path("id") occurrenceId: String, @Body image: RequestBody): ProofPhoto

    @GET("photos/{id}")
    suspend fun proofPhoto(@Path("id") photoId: String): ResponseBody

    @DELETE("photos/{id}")
    suspend fun deleteProofPhoto(@Path("id") photoId: String)

    @POST("reports")
    suspend fun report(@Body body: ReportInput): Created

    // Relationships
    @POST("relationships")
    suspend fun createRelationship(@Body body: CreateRelationshipInput): Relationship

    @POST("relationships/{id}/invites")
    suspend fun createInvite(@Path("id") relationshipId: String, @Body body: CreateInviteInput): Invite

    @POST("relationships/join")
    suspend fun joinRelationship(@Body body: JoinRelationshipInput): Relationship

    @PATCH("relationships/{id}")
    suspend fun updateRelationship(@Path("id") relationshipId: String, @Body body: UpdateRelationshipInput): Relationship

    @PATCH("relationships/{id}")
    suspend fun setProofDays(@Path("id") relationshipId: String, @Body body: ProofDaysInput): Relationship

    @POST("relationships/{id}/leave")
    suspend fun leaveRelationship(@Path("id") relationshipId: String, @Body body: LeaveInput): Relationship

    // Tasks
    @GET("relationships/{id}/tasks")
    suspend fun tasks(@Path("id") relationshipId: String): List<Task>

    /** Sends kit tasks waiting for review to whoever they're for; an empty body sends all of them. */
    @POST("relationships/{id}/tasks/send")
    suspend fun sendDrafts(@Path("id") relationshipId: String, @Body body: Map<String, List<String>> = emptyMap()): List<Task>

    @POST("relationships/{id}/tasks")
    suspend fun createTask(@Path("id") relationshipId: String, @Body body: TaskInput): Task

    @PATCH("tasks/{id}")
    suspend fun updateTask(@Path("id") taskId: String, @Body body: TaskInput): Task

    @DELETE("tasks/{id}")
    suspend fun deleteTask(@Path("id") taskId: String)

    // Occurrences
    @GET("relationships/{id}/occurrences")
    suspend fun occurrences(
        @Path("id") relationshipId: String,
        @Query("from") from: String,
        @Query("to") to: String,
        /** "include" adds curfew nights, which lists leave out; the phone watches Home for them. */
        @Query("curfew") curfew: String? = null,
    ): List<Occurrence>

    // Calendar plans
    @GET("relationships/{id}/events")
    suspend fun events(
        @Path("id") relationshipId: String,
        @Query("from") from: String,
        @Query("to") to: String,
    ): List<CalendarEvent>

    @POST("relationships/{id}/events")
    suspend fun createEvent(@Path("id") relationshipId: String, @Body body: CalendarEventInput): CalendarEvent

    @PATCH("events/{id}")
    suspend fun updateEvent(@Path("id") id: String, @Body body: CalendarEventInput): CalendarEvent

    @PATCH("events/{id}")
    suspend fun changePlanEnd(@Path("id") id: String, @Body body: PlanEndInput): CalendarEvent

    /** My plans someone else changed that I haven't closed yet. */
    @GET("relationships/{id}/events/changes")
    suspend fun planChanges(@Path("id") relationshipId: String): List<CalendarEvent>

    @POST("events/{id}/seen")
    suspend fun seenPlanChange(@Path("id") id: String, @Body body: Map<String, String> = emptyMap())

    @DELETE("events/{id}")
    suspend fun deleteEvent(@Path("id") id: String)

    @POST("events/{id}/dismiss")
    suspend fun dismissClashes(@Path("id") id: String, @Body body: DismissClashesInput): CalendarEvent

    @GET("tasks/{id}/history")
    suspend fun taskHistory(@Path("id") taskId: String, @Query("limit") limit: Int = 100): List<HistoryEntry>

    @GET("relationships/{id}/streaks")
    suspend fun streaks(@Path("id") relationshipId: String): List<TaskStreak>

    @GET("relationships/{id}/stats")
    suspend fun stats(@Path("id") relationshipId: String, @Query("days") days: Int, @Query("zone") zone: String, @Query("userId") userId: String?): DynamicStats

    /** Stats for a whole calendar month ("2026-10"), counted the same as the monthly review. */
    @GET("relationships/{id}/stats")
    suspend fun monthStats(@Path("id") relationshipId: String, @Query("month") month: String, @Query("zone") zone: String, @Query("userId") userId: String?): DynamicStats

    @GET("relationships/{id}/months/{month}")
    suspend fun month(@Path("id") relationshipId: String, @Path("month") month: String, @Query("zone") zone: String): MonthSummary

    @GET("relationships/{id}/months")
    suspend fun pastMonths(@Path("id") relationshipId: String, @Query("zone") zone: String): List<PastMonth>

    @PUT("relationships/{id}/months/{month}/focus")
    suspend fun setMonthFocus(@Path("id") relationshipId: String, @Path("month") month: String, @Body body: MonthFocusInput): MonthFocus

    @PUT("relationships/{id}/months/{month}/review")
    suspend fun saveMonthReview(@Path("id") relationshipId: String, @Path("month") month: String, @Body body: MonthReviewInput, @Query("zone") zone: String): MonthReview

    @GET("relationships/{id}/moods")
    suspend fun moods(@Path("id") relationshipId: String, @Query("days") days: Int): List<MoodEntry>

    @GET("tasks/{id}/stats")
    suspend fun taskStats(@Path("id") taskId: String): TaskStats

    @PATCH("occurrences/{id}")
    suspend fun editOccurrence(@Path("id") occurrenceId: String, @Body body: EditOccurrenceInput): Occurrence

    @POST("occurrences/{id}/steps")
    suspend fun tickStep(@Path("id") occurrenceId: String, @Body body: TickStepInput): Occurrence

    @POST("occurrences/{id}/undo")
    suspend fun undoComplete(@Path("id") occurrenceId: String, @Body body: CompleteOccurrenceInput = CompleteOccurrenceInput()): Occurrence

    @POST("occurrences/{id}/count")
    suspend fun count(@Path("id") occurrenceId: String, @Body body: CountChange): Occurrence

    @POST("occurrences/{id}/complete")
    suspend fun complete(@Path("id") occurrenceId: String, @Body body: CompleteOccurrenceInput): Occurrence

    @POST("occurrences/{id}/confirm-miss")
    suspend fun confirmMiss(@Path("id") occurrenceId: String, @Body body: Map<String, String> = emptyMap()): Occurrence

    /** A Dominant saw a check-in's mood, without replying. */
    @POST("occurrences/{id}/mood-seen")
    suspend fun moodSeen(@Path("id") occurrenceId: String, @Body body: Map<String, String> = emptyMap()): Occurrence

    /** Delays a sub took from their allowance this week that a Dominant hasn't seen yet. */
    @GET("relationships/{id}/delays")
    suspend fun delays(@Path("id") relationshipId: String): List<DelayUsed>

    @POST("reschedules/{id}/seen")
    suspend fun seenDelay(@Path("id") rescheduleId: String, @Body body: Map<String, String> = emptyMap())

    @POST("occurrences/{id}/drop-consequence")
    suspend fun dropConsequence(@Path("id") occurrenceId: String, @Body body: Map<String, String> = emptyMap()): Occurrence

    @POST("occurrences/{id}/review")
    suspend fun review(@Path("id") occurrenceId: String, @Body body: ReviewOccurrenceInput): Occurrence

    @GET("kits")
    suspend fun kits(): List<StarterKit>

    @POST("relationships/{id}/kits/{kit}")
    suspend fun applyKit(@Path("id") relationshipId: String, @Path("kit") kit: String, @Body body: ApplyKitInput): ApplyKitResult

    @POST("relationships/{id}/shared-kits/{code}")
    suspend fun applySharedKit(@Path("id") relationshipId: String, @Path("code") code: String, @Body body: ApplyKitInput): ApplyKitResult

    @GET("me/kits")
    suspend fun myKits(): List<Kit>

    @POST("relationships/{id}/kits")
    suspend fun saveKit(@Path("id") relationshipId: String, @Body body: KitInput): Kit

    @PATCH("kits/{id}")
    suspend fun updateKit(@Path("id") id: String, @Body body: KitPatch): Kit

    @DELETE("kits/{id}")
    suspend fun deleteKit(@Path("id") id: String)

    @POST("kits/{id}/share")
    suspend fun shareKit(@Path("id") id: String, @Body body: Map<String, String> = emptyMap()): Kit

    @DELETE("kits/{id}/share")
    suspend fun unshareKit(@Path("id") id: String): Kit

    @GET("shared-kits/{code}")
    suspend fun sharedKit(@Path("code") code: String): SharedKit

    @POST("shared-kits/{code}/save")
    suspend fun copySharedKit(@Path("code") code: String, @Body body: Map<String, String> = emptyMap()): Kit

    @GET("relationships/{id}/rule-log")
    suspend fun ruleLog(@Path("id") relationshipId: String): List<RuleLogEntry>

    @POST("relationships/{id}/rule-log")
    suspend fun addRuleLog(@Path("id") relationshipId: String, @Body body: RuleLogInput): RuleLogEntry

    @DELETE("rule-log/{id}")
    suspend fun deleteRuleLog(@Path("id") id: String)

    @GET("relationships/{id}/safe-calls")
    suspend fun safeCalls(@Path("id") relationshipId: String): SafeCalls

    @POST("relationships/{id}/safe-calls")
    suspend fun callSafeWord(@Path("id") relationshipId: String, @Body body: SafeCallInput): SafeCall

    @POST("relationships/{id}/role-swap")
    suspend fun askRoleSwap(@Path("id") relationshipId: String, @Body body: RoleSwapInput): RoleSwap

    @POST("relationships/{id}/role-swap/accept")
    suspend fun acceptRoleSwap(@Path("id") relationshipId: String, @Body body: Map<String, String> = emptyMap()): RoleSwap

    /** Declines or takes back a request, or ends a swap that's on. */
    @DELETE("relationships/{id}/role-swap")
    suspend fun endRoleSwap(@Path("id") relationshipId: String)

    @POST("safe-calls/{id}/clear")
    suspend fun clearSafeCall(@Path("id") id: String): SafeCall

    @GET("occurrences/{id}/comments")
    suspend fun comments(@Path("id") occurrenceId: String): List<OccurrenceComment>

    @POST("occurrences/{id}/comments")
    suspend fun addComment(@Path("id") occurrenceId: String, @Body body: CommentInput): OccurrenceComment

    @DELETE("comments/{id}")
    suspend fun deleteComment(@Path("id") commentId: String)

    @GET("notes/{id}/revisions")
    suspend fun noteRevisions(@Path("id") noteId: String): List<NoteRevision>

    @GET("notes/{id}/comments")
    suspend fun noteComments(@Path("id") noteId: String): List<NoteComment>

    @POST("notes/{id}/comments")
    suspend fun addNoteComment(@Path("id") noteId: String, @Body body: CommentInput): NoteComment

    @DELETE("note-comments/{id}")
    suspend fun deleteNoteComment(@Path("id") commentId: String)

    @POST("occurrences/{id}/reschedule")
    suspend fun reschedule(@Path("id") occurrenceId: String, @Body body: RescheduleInput): RescheduleResult

    @POST("relationships/{id}/reschedules/day")
    suspend fun rescheduleDay(@Path("id") relationshipId: String, @Body body: RescheduleDayInput): RescheduleDayResult

    @GET("relationships/{id}/reschedules")
    suspend fun reschedules(
        @Path("id") relationshipId: String,
        @Query("status") status: String = "requested",
    ): List<RescheduleRequest>

    @POST("relationships/{id}/reschedules/plan")
    suspend fun reschedulePlan(@Path("id") relationshipId: String, @Body body: PlanRescheduleInput): PlanRescheduleResult

    @POST("reschedules/{id}/decide")
    suspend fun decideReschedule(@Path("id") requestId: String, @Body body: DecideInput)

    // Points
    @GET("relationships/{id}/ledger")
    suspend fun ledger(@Path("id") relationshipId: String): List<LedgerEntry>

    @GET("relationships/{id}/balances")
    suspend fun balances(@Path("id") relationshipId: String): List<Balance>

    @POST("relationships/{id}/ledger/adjust")
    suspend fun adjustPoints(@Path("id") relationshipId: String, @Body body: AdjustPointsInput)

    // Rewards
    @GET("relationships/{id}/rewards")
    suspend fun rewards(@Path("id") relationshipId: String): List<Reward>

    @POST("relationships/{id}/rewards")
    suspend fun createReward(@Path("id") relationshipId: String, @Body body: RewardInput): Reward

    @PATCH("rewards/{id}")
    suspend fun updateReward(@Path("id") id: String, @Body body: RewardInput): Reward

    @DELETE("rewards/{id}")
    suspend fun deleteReward(@Path("id") id: String)

    @POST("rewards/{id}/redeem")
    suspend fun redeemReward(@Path("id") id: String, @Body body: RedeemInput = RedeemInput())

    /** A Dominant gave the reward a sub spent points on. */
    @POST("ledger/{id}/redeemed")
    suspend fun markRedeemed(@Path("id") ledgerId: String, @Body body: MarkRedeemedInput): LedgerEntry

    // Consequences
    @GET("relationships/{id}/consequences")
    suspend fun consequences(@Path("id") relationshipId: String): List<Consequence>

    @POST("consequences/{id}/assign")
    suspend fun assignConsequence(@Path("id") consequenceId: String, @Body body: AssignConsequenceInput)

    @POST("relationships/{id}/consequences")
    suspend fun createConsequence(@Path("id") relationshipId: String, @Body body: ConsequenceInput): Consequence

    @PATCH("consequences/{id}")
    suspend fun updateConsequence(@Path("id") id: String, @Body body: ConsequenceInput): Consequence

    @DELETE("consequences/{id}")
    suspend fun deleteConsequence(@Path("id") id: String)

    // Rules
    @GET("relationships/{id}/rules")
    suspend fun rules(@Path("id") relationshipId: String): List<Rule>

    @POST("relationships/{id}/rules")
    suspend fun createRule(@Path("id") relationshipId: String, @Body body: RuleInput): Rule

    @PATCH("rules/{id}")
    suspend fun updateRule(@Path("id") id: String, @Body body: RuleInput): Rule

    @DELETE("rules/{id}")
    suspend fun deleteRule(@Path("id") id: String)

    @PUT("relationships/{id}/rules/order")
    suspend fun reorderRules(@Path("id") relationshipId: String, @Body body: ReorderInput): List<Rule>

    // Protocols
    @GET("relationships/{id}/protocols")
    suspend fun protocols(@Path("id") relationshipId: String): List<Protocol>

    @POST("relationships/{id}/protocols")
    suspend fun createProtocol(@Path("id") relationshipId: String, @Body body: ProtocolInput): Protocol

    @PATCH("protocols/{id}")
    suspend fun updateProtocol(@Path("id") id: String, @Body body: ProtocolInput): Protocol

    @DELETE("protocols/{id}")
    suspend fun deleteProtocol(@Path("id") id: String)

    @PUT("relationships/{id}/protocols/order")
    suspend fun reorderProtocols(@Path("id") relationshipId: String, @Body body: ReorderInput): List<Protocol>

    /** Rules and protocols someone else added, changed or removed that I haven't marked seen, newest first. */
    @GET("relationships/{id}/library-changes")
    suspend fun libraryChanges(@Path("id") relationshipId: String): List<LibraryChange>

    @POST("relationships/{id}/library-changes/seen")
    suspend fun seenLibraryChanges(@Path("id") relationshipId: String, @Body body: SeenLibraryChangesInput)

    // Notes
    @GET("relationships/{id}/notes")
    suspend fun notes(@Path("id") relationshipId: String): List<Note>

    @POST("relationships/{id}/notes")
    suspend fun createNote(@Path("id") relationshipId: String, @Body body: NoteInput): Note

    @PATCH("notes/{id}")
    suspend fun updateNote(@Path("id") id: String, @Body body: NoteInput): Note

    @DELETE("notes/{id}")
    suspend fun deleteNote(@Path("id") id: String)

    // Location tasks
    @GET("relationships/{id}/places")
    suspend fun places(@Path("id") relationshipId: String): List<Place>

    @GET("places/search")
    suspend fun searchPlaces(@Query("q") q: String, @Query("lat") lat: Double?, @Query("lng") lng: Double?): List<PlaceSearchResult>

    @GET("imagery")
    suspend fun imagery(): ImageryLink

    @POST("relationships/{id}/places")
    suspend fun createPlace(@Path("id") relationshipId: String, @Body body: PlaceInput): Place

    @PATCH("places/{id}")
    suspend fun updatePlace(@Path("id") id: String, @Body body: PlaceInput): Place

    @DELETE("places/{id}")
    suspend fun deletePlace(@Path("id") id: String)

    @POST("occurrences/{id}/arrive")
    suspend fun arrive(@Path("id") occurrenceId: String, @Body body: ArriveOccurrenceInput): Occurrence

    @POST("occurrences/{id}/leave")
    suspend fun leave(@Path("id") occurrenceId: String, @Body body: LeaveOccurrenceInput): Occurrence

    @PUT("me/location")
    suspend fun reportLocation(@Body body: ReportLocationInput)

    @POST("relationships/{id}/location/ask")
    suspend fun askLocation(@Path("id") relationshipId: String, @Body body: Map<String, String> = emptyMap())

    @PUT("relationships/{id}/location/pause")
    suspend fun pauseLocation(@Path("id") relationshipId: String, @Body body: PauseLocationInput)

    @DELETE("relationships/{id}/location/pause")
    suspend fun resumeLocation(@Path("id") relationshipId: String)

    // Curfew
    @GET("relationships/{id}/curfew")
    suspend fun curfew(@Path("id") relationshipId: String): Curfew

    @PUT("relationships/{id}/curfew")
    suspend fun saveCurfew(@Path("id") relationshipId: String, @Body body: CurfewInput): Curfew

    @POST("occurrences/{id}/home")
    suspend fun homeForCurfew(@Path("id") occurrenceId: String, @Body body: TellHomeInput = TellHomeInput()): Occurrence

    /** After getting home, tell the Dominant (a curfew with reportHome). */
    @POST("occurrences/{id}/tell-home")
    suspend fun tellHome(@Path("id") occurrenceId: String, @Body body: TellHomeInput): Occurrence

    @POST("relationships/{id}/curfew/excuse")
    suspend fun excuseCurfew(@Path("id") relationshipId: String, @Body body: ExcuseCurfewInput): Occurrence

    @POST("relationships/{id}/curfew/check")
    suspend fun curfewCheck(@Path("id") relationshipId: String, @Body body: CurfewCheckInput): CurfewCheck

    @POST("relationships/{id}/curfew/requests")
    suspend fun askCurfew(@Path("id") relationshipId: String, @Body body: CurfewRequestInput): CurfewRequest

    @POST("curfew-requests/{id}/approve")
    suspend fun approveCurfew(@Path("id") requestId: String, @Body body: ApproveCurfewRequestInput): CurfewRequest

    @POST("curfew-requests/{id}/decline")
    suspend fun declineCurfew(@Path("id") requestId: String, @Body body: Map<String, String> = emptyMap()): CurfewRequest

    // Agreement
    @GET("relationships/{id}/agreement")
    suspend fun agreement(@Path("id") relationshipId: String): Agreement

    @GET("agreement-versions/{id}")
    suspend fun agreementVersion(@Path("id") id: String): AgreementVersion

    @GET("relationships/{id}/agreement/template")
    suspend fun agreementTemplate(@Path("id") relationshipId: String): AgreementTemplate

    /** Proposes a version, or edits the open proposal; whoever sends it has agreed to it. */
    @POST("relationships/{id}/agreement")
    suspend fun proposeAgreement(@Path("id") relationshipId: String, @Body body: AgreementInput): AgreementVersion

    @POST("agreement-versions/{id}/agree")
    suspend fun agreeToAgreement(@Path("id") id: String, @Body body: Map<String, String> = emptyMap()): AgreementVersion

    @POST("agreement-versions/{id}/request-changes")
    suspend fun requestAgreementChanges(@Path("id") id: String, @Body body: AgreementFeedbackInput): AgreementVersion

    /** Withdraws an open proposal; only whoever proposed it can. */
    @DELETE("agreement-versions/{id}")
    suspend fun withdrawAgreement(@Path("id") id: String)

    // Scenes and aftercare
    @GET("relationships/{id}/scenes")
    suspend fun scenes(@Path("id") relationshipId: String): List<Scene>

    @POST("relationships/{id}/scenes")
    suspend fun logScene(@Path("id") relationshipId: String, @Body body: SceneInput): Scene

    @GET("scenes/{id}")
    suspend fun scene(@Path("id") id: String): Scene

    @PUT("scenes/{id}")
    suspend fun updateScene(@Path("id") id: String, @Body body: SceneInput): Scene

    /** Only whoever logged it can. */
    @DELETE("scenes/{id}")
    suspend fun deleteScene(@Path("id") id: String)

    /** Shares my side the first time; later saves edit it. */
    @PUT("scenes/{id}/side")
    suspend fun shareSceneSide(@Path("id") id: String, @Body body: SceneSideInput): Scene

    @PUT("scenes/{id}/check")
    suspend fun checkInOnScene(@Path("id") id: String, @Body body: SceneCheckInput): Scene

    /** Someone else has seen a check-in that asked for them; a comment on the scene does this too. */
    @POST("scenes/{id}/checks/{userId}/seen")
    suspend fun sceneCheckSeen(@Path("id") id: String, @Path("userId") userId: String, @Body body: Map<String, String> = emptyMap()): Scene

    /** Closes the others' aftercare plans on Today for this scene. */
    @POST("scenes/{id}/aftercare-done")
    suspend fun aftercareDone(@Path("id") id: String, @Body body: Map<String, String> = emptyMap()): Scene

    @GET("scenes/{id}/comments")
    suspend fun sceneComments(@Path("id") id: String): List<SceneComment>

    @POST("scenes/{id}/comments")
    suspend fun addSceneComment(@Path("id") id: String, @Body body: CommentInput): SceneComment

    @DELETE("scene-comments/{id}")
    suspend fun deleteSceneComment(@Path("id") commentId: String)

    /** Everyone's plan in the dynamic, an empty one for whoever hasn't written theirs. */
    @GET("relationships/{id}/aftercare")
    suspend fun aftercarePlans(@Path("id") relationshipId: String): List<AftercarePlan>

    @PUT("relationships/{id}/aftercare")
    suspend fun saveAftercarePlan(@Path("id") relationshipId: String, @Body body: AftercarePlanInput): AftercarePlan

    // Chastity
    @GET("relationships/{id}/chastity")
    suspend fun chastity(@Path("id") relationshipId: String): ChastityView

    /** The keyholder asking to lock someone; it starts when they lock up. */
    @POST("relationships/{id}/chastity")
    suspend fun startLock(@Path("id") relationshipId: String, @Body body: ChastityLockInput): ChastityLock

    /** The wearer locking up, or relocking after a break; a keybox lock sends the sealed photo of the code. */
    @POST("chastity/{id}/lock")
    suspend fun lockUp(@Path("id") lockId: String, @Body body: Map<String, String> = emptyMap()): ChastityLock

    @POST("chastity/{id}/lock")
    suspend fun lockUpWithKeybox(@Path("id") lockId: String, @Body image: RequestBody): ChastityLock

    /** Declines or takes back a lock that hasn't started, or (the keyholder) releases a running one. */
    @DELETE("chastity/{id}")
    suspend fun endLock(@Path("id") lockId: String)

    @POST("chastity/{id}/time")
    suspend fun lockTime(@Path("id") lockId: String, @Body body: ChastityTimeInput): ChastityLock

    @POST("chastity/{id}/asks")
    suspend fun chastityAsk(@Path("id") lockId: String, @Body body: ChastityAskInput): ChastityEvent

    @POST("chastity/asks/{id}/decide")
    suspend fun decideChastityAsk(@Path("id") eventId: String, @Body body: ChastityDecideInput): ChastityLock

    @POST("chastity/{id}/photo-ask")
    suspend fun chastityPhotoAsk(@Path("id") lockId: String, @Body body: ChastityPhotoAskInput): ChastityPhotoAsk

    @GET("chastity/{id}/keybox")
    suspend fun keybox(@Path("id") lockId: String): ResponseBody

    // Push
    @POST("devices")
    suspend fun registerDevice(@Body body: RegisterDeviceInput)

    @GET("me/devices")
    suspend fun devices(): List<DeviceStatus>

    @POST("me/test-push")
    suspend fun testPush(): List<DeviceStatus>

    @GET("relationships/{id}/limit-list")
    suspend fun limitList(@Path("id") relationshipId: String): LimitList

    @PUT("relationships/{id}/limit-list/answers/{key}")
    suspend fun answerLimit(@Path("id") relationshipId: String, @Path("key") key: String, @Body body: LimitAnswerInput): LimitAnswer

    @POST("relationships/{id}/limit-list/items")
    suspend fun addLimitItem(@Path("id") relationshipId: String, @Body body: LimitItemInput): LimitItem

    @DELETE("relationships/{id}/limit-list/items/{key}")
    suspend fun removeLimitItem(@Path("id") relationshipId: String, @Path("key") key: String)

    @PUT("relationships/{id}/limit-list/finished")
    suspend fun finishLimits(@Path("id") relationshipId: String, @Body body: Map<String, String> = emptyMap())
}
