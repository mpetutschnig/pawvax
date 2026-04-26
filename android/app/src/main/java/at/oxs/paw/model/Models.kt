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
    val created_at: String
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
    val added_by_role: String? = null
)

// Request Bodies
data class LoginRequest(val email: String, val password: String)
data class RegisterRequest(val name: String, val email: String, val password: String)
data class CreateAnimalRequest(val name: String, val species: String, val breed: String?, val birthdate: String?, val tagId: String?, val tagType: String?)
data class AddTagRequest(val tagId: String, val tagType: String)
data class UpdateTagRequest(val active: Boolean)
