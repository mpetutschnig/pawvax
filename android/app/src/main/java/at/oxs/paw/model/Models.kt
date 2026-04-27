package at.oxs.paw.model

data class AuthResponse(val token: String, val account: Account)
data class Account(val id: String, val name: String, val email: String)

data class Animal(
    val id: String,
    val account_id: String,
    val name: String,
    val species: String,
    val breed: String?,
    val birthdate: String?,
    val created_at: String,
    val avatar_path: String? = null
)

data class AnimalTag(
    val tag_id: String,
    val animal_id: String,
    val tag_type: String,
    val active: Int,
    val added_at: String
)

data class Document(
    val id: String,
    val animal_id: String,
    val doc_type: String,
    val image_path: String,
    val extracted_json: Any?,
    val ocr_provider: String?,
    val created_at: String,
    val added_by_role: String? = null,
    val is_owner: Boolean? = false,
    val is_uploader: Boolean? = false,
    val allowed_roles: String? = null
)

data class AccountProfile(
    val id: String,
    val name: String,
    val email: String,
    val role: String,
    val verified: Int,
    val created_at: String,
    val gemini_token: String? = null
)

data class AvatarResponse(val avatar_url: String)

data class SharingSettings(
    val animal_id: String,
    val roles: Map<String, Map<String, Boolean>>
)

data class Organization(
    val id: String,
    val name: String,
    val type: String,
    val owner_id: String,
    val created_at: String
)

data class OrgMember(
    val account_id: String,
    val name: String,
    val email: String,
    val role: String,
    val accepted: Int
)

data class AdminAccount(
    val id: String,
    val email: String,
    val name: String,
    val role: String,
    val verified: Int,
    val created_at: String
)

data class AuditLogEntry(
    val id: String,
    val account_id: String,
    val action: String,
    val resource: String,
    val resource_id: String?,
    val details: String?,
    val ip: String?,
    val created_at: String
)

// Request Bodies
data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val name: String, val email: String, val password: String)
data class CreateAnimalRequest(val name: String, val species: String, val breed: String?, val birthdate: String?, val tagId: String?, val tagType: String?)
data class AddTagRequest(val tagId: String, val tagType: String)
data class UpdateTagRequest(val active: Boolean)

data class UpdateProfileRequest(
    val name: String? = null,
    val gemini_token: String? = null
)

data class UpdateAnimalRequest(
    val name: String? = null,
    val species: String? = null,
    val breed: String? = null,
    val birthdate: String? = null
)

data class AvatarUploadRequest(val image: String)

data class UpdateDocumentRequest(
    val doc_type: String? = null,
    val extracted_json: Any? = null,
    val allowed_roles: List<String>? = null
)

data class UpdateSharingRequest(val roles: Map<String, Map<String, Boolean>>)

data class CreateOrgRequest(
    val name: String,
    val type: String = "family"
)

data class InviteRequest(val email: String)

data class UpdateRoleRequest(
    val role: String,
    val verified: Int? = null
)

data class VerifyRequest(val verified: Int)
