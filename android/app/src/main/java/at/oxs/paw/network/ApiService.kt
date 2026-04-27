package at.oxs.paw.network

import at.oxs.paw.model.*
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("auth/login")
    suspend fun login(@Body body: LoginRequest): AuthResponse

    @POST("auth/register")
    suspend fun register(@Body body: RegisterRequest): AuthResponse

    @GET("animals/by-tag/{tagId}")
    suspend fun getAnimalByTag(@Path("tagId") tagId: String): Animal

    @GET("animals")
    suspend fun getAnimals(): List<Animal>

    @POST("animals")
    suspend fun createAnimal(@Body body: CreateAnimalRequest): Animal

    @GET("animals/{id}")
    suspend fun getAnimal(@Path("id") id: String): Animal

    @GET("animals/{id}/documents")
    suspend fun getAnimalDocuments(@Path("id") id: String): List<Document>

    @GET("animals/{id}/tags")
    suspend fun getAnimalTags(@Path("id") id: String): List<AnimalTag>

    @POST("animals/{id}/tags")
    suspend fun addTag(@Path("id") id: String, @Body body: AddTagRequest): AnimalTag

    @PATCH("animal-tags/{tagId}")
    suspend fun updateTag(@Path("tagId") tagId: String, @Body body: UpdateTagRequest): AnimalTag

    @GET("documents/{id}")
    suspend fun getDocument(@Path("id") id: String): Document

    @POST("auth/logout")
    suspend fun logout(): Response<Unit>

    @GET("accounts/me")
    suspend fun getProfile(): AccountProfile

    @PATCH("accounts/me")
    suspend fun updateProfile(@Body body: UpdateProfileRequest): Response<Unit>

    @POST("accounts/request-verification")
    suspend fun requestVerification(): Response<Unit>

    @DELETE("accounts/me")
    suspend fun deleteAccount(): Response<Unit>

    @PATCH("animals/{id}")
    suspend fun updateAnimal(@Path("id") id: String, @Body body: UpdateAnimalRequest): Animal

    @DELETE("animals/{id}")
    suspend fun deleteAnimal(@Path("id") id: String): Response<Unit>

    @PATCH("animals/{id}/avatar")
    suspend fun uploadAvatar(@Path("id") id: String, @Body body: AvatarUploadRequest): Response<AvatarResponse>

    @DELETE("documents/{id}")
    suspend fun deleteDocument(@Path("id") id: String): Response<Unit>

    @PATCH("documents/{id}")
    suspend fun updateDocument(@Path("id") id: String, @Body body: UpdateDocumentRequest): Response<Unit>

    @GET("animals/{id}/sharing")
    suspend fun getSharing(@Path("id") id: String): SharingSettings

    @PUT("animals/{id}/sharing")
    suspend fun updateSharing(@Path("id") id: String, @Body body: UpdateSharingRequest): SharingSettings

    @GET("organizations")
    suspend fun getOrganizations(): List<Organization>

    @POST("organizations")
    suspend fun createOrganization(@Body body: CreateOrgRequest): Organization

    @POST("organizations/{id}/invite")
    suspend fun inviteToOrg(@Path("id") id: String, @Body body: InviteRequest): Response<Unit>

    @POST("organizations/{id}/accept")
    suspend fun acceptOrgInvite(@Path("id") id: String): Response<Unit>

    @GET("organizations/{id}/members")
    suspend fun getOrgMembers(@Path("id") id: String): List<OrgMember>

    @DELETE("organizations/{id}/members/{memberId}")
    suspend fun removeOrgMember(@Path("id") id: String, @Path("memberId") memberId: String): Response<Unit>

    @GET("admin/accounts")
    suspend fun getAdminAccounts(): List<AdminAccount>

    @GET("admin/audit")
    suspend fun getAuditLog(): List<AuditLogEntry>

    @GET("admin/stats")
    suspend fun getAdminStats(): AdminStats

    @GET("admin/animals")
    suspend fun getAdminAnimals(): List<AdminAnimal>

    @GET("admin/accounts/pending-verification")
    suspend fun getPendingVerifications(): List<PendingVerification>

    @PATCH("admin/accounts/{id}")
    suspend fun updateAccountRole(@Path("id") id: String, @Body body: UpdateRoleRequest): Response<Unit>

    @POST("admin/accounts/{id}/verify")
    suspend fun verifyAccount(@Path("id") id: String, @Body body: VerifyRequest): Response<Unit>
}
