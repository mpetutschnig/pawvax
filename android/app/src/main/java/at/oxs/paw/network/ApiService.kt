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
}
