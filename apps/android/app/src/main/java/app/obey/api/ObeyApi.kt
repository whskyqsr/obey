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

    /** A square JPEG; the app crops and shrinks it first. */
    @PUT("me/avatar")
    suspend fun setAvatar(@Body image: RequestBody): User

    @DELETE("me/avatar")
    suspend fun deleteAvatar(): User

    @GET("users/{id}/avatar")
    suspend fun avatar(@Path("id") userId: String, @Query("v") version: String): ResponseBody

    // Relationships
    @POST("relationships")
    suspend fun createRelationship(@Body body: CreateRelationshipInput): Relationship

    @POST("relationships/{id}/invites")
    suspend fun createInvite(@Path("id") relationshipId: String): Invite

    @POST("relationships/join")
    suspend fun joinRelationship(@Body body: JoinRelationshipInput): Relationship

    @PATCH("relationships/{id}")
    suspend fun updateRelationship(@Path("id") relationshipId: String, @Body body: UpdateRelationshipInput): Relationship

    // Tasks
    @GET("relationships/{id}/tasks")
    suspend fun tasks(@Path("id") relationshipId: String): List<Task>

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
    ): List<Occurrence>

    @POST("occurrences/{id}/complete")
    suspend fun complete(@Path("id") occurrenceId: String, @Body body: CompleteOccurrenceInput): Occurrence

    @POST("occurrences/{id}/review")
    suspend fun review(@Path("id") occurrenceId: String, @Body body: ReviewOccurrenceInput): Occurrence

    @POST("occurrences/{id}/reschedule")
    suspend fun reschedule(@Path("id") occurrenceId: String, @Body body: RescheduleInput): RescheduleResult

    @POST("relationships/{id}/reschedules/day")
    suspend fun rescheduleDay(@Path("id") relationshipId: String, @Body body: RescheduleDayInput): RescheduleDayResult

    @GET("relationships/{id}/reschedules")
    suspend fun reschedules(
        @Path("id") relationshipId: String,
        @Query("status") status: String = "requested",
    ): List<RescheduleRequest>

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
    suspend fun redeemReward(@Path("id") id: String)

    // Consequences
    @GET("relationships/{id}/consequences")
    suspend fun consequences(@Path("id") relationshipId: String): List<Consequence>

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

    // Notes
    @GET("relationships/{id}/notes")
    suspend fun notes(@Path("id") relationshipId: String): List<Note>

    @POST("relationships/{id}/notes")
    suspend fun createNote(@Path("id") relationshipId: String, @Body body: NoteInput): Note

    @PATCH("notes/{id}")
    suspend fun updateNote(@Path("id") id: String, @Body body: NoteInput): Note

    @DELETE("notes/{id}")
    suspend fun deleteNote(@Path("id") id: String)

    // Push
    @POST("devices")
    suspend fun registerDevice(@Body body: RegisterDeviceInput)
}
